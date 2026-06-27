# BTP Lense

A SAPUI5 + CAP Node.js monitoring tool that provides real-time visibility into SAP BTP service consumption, cloud costs, and Cloud Foundry application health across multiple global accounts.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20 | https://nodejs.org |
| SAP CDS DK | ≥ 9 | `npm i -g @sap/cds-dk` |
| CF CLI | latest | https://docs.cloudfoundry.org/cf-cli |
| MBT (MTA Build Tool) | ≥ 1.2 | `npm i -g mbt` |
| CF MultiApps plugin | latest | `cf install-plugin multiapps` |

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure accounts

`srv/accounts.json` is git-ignored (contains secrets). Create it manually:

```bash
cp srv/accounts.json.example srv/accounts.json   # if example exists
# or create from scratch:
```

```json
{
  "GLOBAL_ACCOUNTS": [
    {
      "authUrl": "https://<subdomain>.authentication.<region>.hana.ondemand.com/oauth/token",
      "clientId": "<clientid from UAS service key>",
      "clientSecret": "<clientsecret from UAS service key>",
      "usageUrl": "https://uas-reporting.cfapps.<region>.hana.ondemand.com/reports/v1/monthlyUsage",
      "costUrl": "https://uas-reporting.cfapps.<region>.hana.ondemand.com/reports/v1/monthlySubaccountsCost"
    }
  ]
}
```

> **Where to get these values:**
> BTP Cockpit → Global Account → Services → Instances and Subscriptions →
> find the **Usage and Accounting Model for SAP BTP** instance → Service Keys → Create key → copy `uaa.clientid`, `uaa.clientsecret`, `uaa.url`, and `url`.
> Add `/oauth/token` to `uaa.url` for `authUrl`.
> Append `/reports/v1/monthlyUsage` and `/reports/v1/monthlySubaccountsCost` to `url` for the usage/cost URLs.

Add multiple objects to `GLOBAL_ACCOUNTS` if you have more than one global account.

### 3. Log in to Cloud Foundry (needed for CF Apps tab)

```bash
cf login -a https://api.cf.eu30.hana.ondemand.com
```

The app reads the refresh token from `~/.cf/config.json` automatically when running locally.

### 4. Run locally

**Option A — watch mode (recommended, auto-opens browser):**
```bash
npm run watch-btplense
```
Opens `http://localhost:4004/btplense/index.html?sap-ui-xx-viewCache=false`

**Option B — plain server:**
```bash
npm start
```
Then navigate to `http://localhost:4004/btplense/index.html`

---

## Project Structure

```
BTPMonitorTool-local/
├── app/
│   ├── btplense/          # SAPUI5 frontend (original — used by existing Work Zone tile)
│   │   ├── controller/
│   │   │   └── View1.controller.js   # main logic: data loading, alerts, charts
│   │   ├── view/
│   │   │   └── View1.view.xml        # 5-tab layout: Uses Monitor, Cost, Reporting, App Cost, CF Apps
│   │   ├── css/style.css             # custom styles incl. full-row alert highlighting
│   │   ├── manifest.json             # SAPUI5 app descriptor (id: btplense, service: btpmonitoringtool)
│   │   └── xs-app.json               # app router routing rules
│   └── btplensev2/        # SAPUI5 frontend (new BTP deployment copy)
│       └── ...            # same structure, different app id (btplensev2) and destination (BTPLense-api)
├── srv/
│   ├── service.cds        # CAP service definition
│   ├── service.js         # backend: fetchUsage, fetchCost, fetchAppCost, fetchApps
│   └── accounts.json      # ⚠️ git-ignored — BTP global account OAuth credentials
├── mta.yaml               # MTA descriptor for BTP deployment
├── xs-security.json       # XSUAA app security descriptor
└── package.json
```

---

## BTP Deployment

### 1. Log in to CF

```bash
cf login -a https://api.cf.eu30.hana.ondemand.com \
         -o "Abhiyanta_India Solutions Private Limited_sap-btp-ais-d0a7p7v8" \
         -s dev
```

### 2. Build the MTA archive

```bash
npm run build
```

This cleans all previous build artifacts and produces `mta_archives/archive.mtar`.

### 3. Deploy

```bash
npm run deploy
```

Deploys to CF org/space configured in `mta.yaml`. On first deploy, services are created automatically.

### 4. Set CF refresh token on the backend app (required for CF Apps tab)

```bash
cf set-env BTPLense-srv CF_REFRESH_TOKEN <your-refresh-token>
cf restage BTPLense-srv
```

Get your current refresh token from `~/.cf/config.json` → `RefreshToken`.

### Undeploy

```bash
npm run undeploy
```

> ⚠️ This deletes **all** services created by this MTA including XSUAA and the Destination service.

---

## Features

| Tab | Description |
|---|---|
| **Uses Monitor** | Monthly BTP service usage across all global accounts with filters and CSV download |
| **Cost Analysis** | Monthly cost breakdown by subaccount/service with total cost summary |
| **Reporting** | 8 interactive charts — usage and cost analytics (column, pie, line charts) |
| **App Cost Estimate** | Proportional CF Runtime cost per application based on memory usage share |
| **CF Apps** | Live Cloud Foundry application status: state, instances, CPU %, memory |

**Alert system:** A bell icon in the header shows a badge count when anomalies are detected (stopped apps, high memory usage, high estimated cost). Rows are colour-highlighted — red for critical, yellow/orange for warnings.

---

## Required BTP Services

| Service | Plan | Purpose |
|---|---|---|
| Authorization & Trust Management (XSUAA) | application | OAuth 2.0 for backend + frontend |
| HTML5 Application Repository | app-host | Hosts SAPUI5 files (reuses existing `BTPMonitorTool-html5-service`) |
| Destination Service | lite | Stores backend API destination for app router |
| SAP Build Work Zone | standard | Managed app router + launchpad (must already exist) |
| Usage & Accounting Service (UAS) | reporting-ga-admin | Source of usage and cost data — credentials go in `accounts.json` |
| Cloud Foundry API | platform | Live app stats for CF Apps tab (no service needed, uses CF token) |
