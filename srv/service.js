const cds = require("@sap/cds");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const accountsFile = path.join(__dirname, "accounts.json");
const { GLOBAL_ACCOUNTS } = JSON.parse(fs.readFileSync(accountsFile, "utf8"));

// Default region; overridden per-request by the cf config Target (local) or CF_API env (BTP)
const DEFAULT_CF_API = "https://api.cf.eu30.hana.ondemand.com";

module.exports = cds.service.impl(async function () {

  function getCFApi() {
    // On BTP: set CF_API env var to the landscape API endpoint.
    if (process.env.CF_API) return process.env.CF_API;
    // On local: read the active target from cf config (set by cf login).
    try {
      const cfConfigPath = path.join(process.env.HOME, ".cf/config.json");
      const cfConfig = JSON.parse(fs.readFileSync(cfConfigPath, "utf8"));
      if (cfConfig.Target) return cfConfig.Target.replace(/\/$/, "");
    } catch (e) {}
    return DEFAULT_CF_API;
  }

  async function getCFToken() {
    // On BTP: set CF_REFRESH_TOKEN env var via: cf set-env BTPLense-srv CF_REFRESH_TOKEN <token>
    // On local: reads from ~/.cf/config.json (set by cf login)
    if (process.env.CF_REFRESH_TOKEN) {
      const authEndpoint = process.env.CF_AUTH_URL || "https://login.cf.eu30.hana.ondemand.com";
      const params = new URLSearchParams();
      params.append("grant_type", "refresh_token");
      params.append("refresh_token", process.env.CF_REFRESH_TOKEN);
      const res = await axios.post(`${authEndpoint}/oauth/token`, params, {
        headers: {
          "Authorization": "Basic " + Buffer.from("cf:").toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });
      return `bearer ${res.data.access_token}`;
    }

    // Local development fallback
    const cfConfigPath = path.join(process.env.HOME, ".cf/config.json");
    const cfConfig = JSON.parse(fs.readFileSync(cfConfigPath, "utf8"));
    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", cfConfig.RefreshToken);
    const res = await axios.post(`${cfConfig.AuthorizationEndpoint}/oauth/token`, params, {
      headers: {
        "Authorization": "Basic " + Buffer.from("cf:").toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
    cfConfig.AccessToken = `bearer ${res.data.access_token}`;
    cfConfig.RefreshToken = res.data.refresh_token;
    fs.writeFileSync(cfConfigPath, JSON.stringify(cfConfig));
    return `bearer ${res.data.access_token}`;
  }

  async function getToken(account) {
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", account.clientId);
    params.append("client_secret", account.clientSecret);
    const res = await axios.post(account.authUrl, params);
    return res.data.access_token;
  }

  async function callAPI(token, url) {
    try {
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      return res.data;
    } catch (e) {
      return [];
    }
  }

  async function resolveAppNames(guids) {
    if (!guids.length) return {};
    try {
      const token = await getCFToken();
      const CF_API = getCFApi();
      const res = await axios.get(`${CF_API}/v3/apps?guids=${guids.join(",")}&per_page=200`, {
        headers: { Authorization: token }
      });
      const map = {};
      (res.data.resources || []).forEach(app => { map[app.guid] = app.name; });
      return map;
    } catch (e) {
      return {};
    }
  }

  async function processAllAccounts(urlType, fromDate, toDate) {
    let finalResult = { data: [] };
    for (const acc of GLOBAL_ACCOUNTS) {
      const token = await getToken(acc);
      const fullUrl = `${acc[urlType]}?fromDate=${fromDate}&toDate=${toDate}`;
      const apiData = await callAPI(token, fullUrl);
      if (apiData?.content) {
        finalResult.data.push(...apiData.content);
      } else {
        finalResult.data.push(...apiData);
      }
    }
    return finalResult;
  }

  this.on("fetchUsage", async req => {
    const { fromDate, toDate } = req.data;
    const result = await processAllAccounts("usageUrl", fromDate, toDate);

    const cfGuids = [...new Set(
      result.data
        .filter(r => r.application && r.application.trim())
        .map(r => r.application)
    )];

    const appNameMap = await resolveAppNames(cfGuids);
    result.data.forEach(row => {
      row.applicationName = (row.application && appNameMap[row.application]) || "";
    });

    return result;
  });

  this.on("fetchCost", async req => {
    const { fromDate, toDate } = req.data;
    return processAllAccounts("costUrl", fromDate, toDate);
  });

  this.on("fetchAppCost", async req => {
    const { fromDate, toDate } = req.data;
    try {
      const [costResult, usageResult] = await Promise.all([
        processAllAccounts("costUrl", fromDate, toDate),
        processAllAccounts("usageUrl", fromDate, toDate)
      ]);

      // Total CF Runtime cost per subaccount
      const subaccountCost = {};
      costResult.data
        .filter(r => r.serviceId === "linux-container")
        .forEach(r => {
          if (!subaccountCost[r.subaccountId]) {
            subaccountCost[r.subaccountId] = { cost: 0, subaccountName: r.subaccountName, currency: r.currency };
          }
          subaccountCost[r.subaccountId].cost += (r.cost || 0);
        });

      // Memory usage per app — use whichever metric is available (blocks preferred, fallback to memory_per_hour)
      const appData = {};
      usageResult.data
        .filter(r => r.serviceId === "linux-container" && r.application && r.application.trim())
        .forEach(r => {
          const key = `${r.subaccountId}::${r.application}`;
          if (!appData[key]) {
            appData[key] = {
              guid: r.application,
              subaccountId: r.subaccountId,
              subaccountName: r.subaccountName,
              spaceName: r.spaceName || "",
              runtimeUsage: 0,
              persistentUsage: 0,
              memoryHours: 0
            };
          }
          if (r.measureId === "runtime_memory_in_16_gb_blocks") appData[key].runtimeUsage += (r.usage || 0);
          if (r.measureId === "persistent_memory_in_16_gb_blocks") appData[key].persistentUsage += (r.usage || 0);
          if (r.measureId === "memory_per_hour") appData[key].memoryHours += (r.usage || 0);
        });

      // Total usage per subaccount for proportional split
      const subaccountTotalUsage = {};
      Object.values(appData).forEach(app => {
        if (!subaccountTotalUsage[app.subaccountId]) subaccountTotalUsage[app.subaccountId] = 0;
        const appUsage = (app.runtimeUsage + app.persistentUsage) || app.memoryHours;
        subaccountTotalUsage[app.subaccountId] += appUsage;
      });

      const allGuids = [...new Set(Object.values(appData).map(a => a.guid))];
      const appNameMap = await resolveAppNames(allGuids);

      const data = Object.values(appData).map(app => {
        const appUsage = (app.runtimeUsage + app.persistentUsage) || app.memoryHours;
        const subTotalUsage = subaccountTotalUsage[app.subaccountId] || 1;
        const subCost = subaccountCost[app.subaccountId]?.cost || 0;
        const currency = subaccountCost[app.subaccountId]?.currency || "EUR";
        const estimatedCost = subTotalUsage > 0 ? (appUsage / subTotalUsage) * subCost : 0;

        return {
          name: appNameMap[app.guid] || app.guid,
          guid: app.guid,
          subaccountName: app.subaccountName,
          spaceName: app.spaceName,
          runtimeUsage: Number((app.runtimeUsage || app.memoryHours).toFixed(3)),
          persistentUsage: Number(app.persistentUsage.toFixed(3)),
          totalUsage: Number(appUsage.toFixed(3)),
          sharePercent: Number(((appUsage / subTotalUsage) * 100).toFixed(1)),
          estimatedCost: Number(estimatedCost.toFixed(2)),
          currency
        };
      }).sort((a, b) => b.estimatedCost - a.estimatedCost);

      return JSON.stringify({ data });
    } catch (e) {
      return JSON.stringify({ data: [], error: e.message });
    }
  });

  this.on("fetchApps", async req => {
    try {
      const token = await getCFToken();
      const CF_API = getCFApi();
      const headers = { Authorization: token };

      const appsRes = await axios.get(`${CF_API}/v3/apps?per_page=200`, { headers });
      const apps = appsRes.data.resources || [];

      const spaceGuids = [...new Set(apps.map(a => a.relationships.space.data.guid))];
      const spacesRes = await axios.get(`${CF_API}/v3/spaces?guids=${spaceGuids.join(",")}&per_page=200`, { headers });
      const spaceMap = {};
      (spacesRes.data.resources || []).forEach(s => { spaceMap[s.guid] = s.name; });

      const data = await Promise.all(apps.map(async app => {
        let instances = [], cpuPercent = 0, memoryMB = 0, memoryQuotaMB = 0;

        if (app.state === "STARTED") {
          try {
            const statsRes = await axios.get(`${CF_API}/v3/apps/${app.guid}/processes/web/stats`, { headers });
            instances = statsRes.data.resources || [];
            const running = instances.filter(i => i.state === "RUNNING");
            if (running.length) {
              cpuPercent = Number((running.reduce((a, b) => a + (b.usage?.cpu || 0), 0) / running.length * 100).toFixed(2));
              memoryMB = Number((running.reduce((a, b) => a + (b.usage?.mem || 0), 0) / 1024 / 1024).toFixed(0));
              memoryQuotaMB = Number(((running[0]?.mem_quota || 0) / 1024 / 1024).toFixed(0));
            }
          } catch (e) {}
        }

        const runningCount = instances.filter(i => i.state === "RUNNING").length;

        return {
          name: app.name,
          guid: app.guid,
          state: app.state,
          spaceName: spaceMap[app.relationships.space.data.guid] || "Unknown",
          instances: `${runningCount}/${instances.length}`,
          cpuPercent,
          memoryMB,
          memoryQuotaMB,
          createdAt: app.created_at ? app.created_at.substring(0, 10) : ""
        };
      }));

      return JSON.stringify({ data });
    } catch (e) {
      return JSON.stringify({ data: [], error: e.message });
    }
  });

});
