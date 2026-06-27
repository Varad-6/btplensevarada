sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox"

], (Controller, JSONModel, MessageBox) => {
    "use strict";

    return Controller.extend("btplense.controller.View1", {
        onInit: function () {


            // Set UI5 language to Hindi
            //   sap.ui.getCore().getConfiguration().setLanguage("en_US");

            const obj = new JSONModel({
                getUsageData: [],
                uniqueGlobalAccounts: [],
                uniqueServices: [],
                uniqueSubaccounts: [],
                uniqueSpaces: [],
                uniqueApplications: [],
                uniqueUsage: [],
                totalUsage: 0,
                filteredCount: 0
            });

            const costObj = new JSONModel({
                originalData: [],
                getCostData: [],
                costGlobalAccount: [],
                costSubaccount: [],
                costServices: [],
                costReportYearDate: [],
                totalCost: 0,
                costCount: 0,
                activeFilters: 0,
                subaccountCostChart: [],
                monthlyTrendChart: []
            });


            const appsModel = new JSONModel({
                getAppsData: [],
                totalApps: 0,
                runningApps: 0,
                stoppedApps: 0
            });

            const appCostModel = new JSONModel({
                getAppCostData: [],
                totalEstimatedCost: 0,
                currency: "EUR",
                appCount: 0
            });

            const alertsModel = new JSONModel({ alerts: [], count: 0 });

            this.getView().setModel(obj, "obj");
            this.getView().setModel(costObj, "costObj");
            this.getView().setModel(appsModel, "appsModel");
            this.getView().setModel(appCostModel, "appCostModel");
            this.getView().setModel(alertsModel, "alerts");

            var today = new Date();
            var year = today.getFullYear();
            var month = today.getMonth() + 1;

            // Make month 2-digit
            month = month < 10 ? "0" + month : month;

            // Set default values
            this.byId("fromDatePicker").setValue(year + "-" + month + "-01");
            this.byId("toDatePicker").setValue(year + "-" + month + "-01");

            this.byId("fromDatePickerCost").setValue(year + "-" + month + "-01");
            this.byId("toDatePickerCost").setValue(year + "-" + month + "-01");



        },

        onPressLoadCostData: function () {

            sap.ui.core.BusyIndicator.show(0);

            const fromDateObj = this.byId("fromDatePickerCost").getDateValue();
            const toDateObj = this.byId("toDatePickerCost").getDateValue();


            if (!fromDateObj || !toDateObj) {
                sap.ui.core.BusyIndicator.hide();
                sap.m.MessageToast.show("Select Both From Date And To Date");
                return;
            }

            if (fromDateObj > toDateObj) {
                sap.ui.core.BusyIndicator.hide();
                sap.m.MessageToast.show("From Date Always Greater Than To Date");
                return;
            }

            const fromDate = this._formatDateToYYYYMM(fromDateObj);
            const toDate = this._formatDateToYYYYMM(toDateObj);

            const payload = { fromDate, toDate };

            const oSrvModel = this.getOwnerComponent().getModel();
            const url = oSrvModel.sServiceUrl + "/fetchCost";

            const getUniqueClean = (arr, key) => {
                return [...new Set(
                    arr.map(item => item[key]).filter(v => v !== null && v !== undefined && v !== "")
                )].sort();
            };

            const formatReportYearMonth = (yyyymm) => {
                if (!yyyymm) return "";
                const str = yyyymm.toString();
                const year = str.substring(0, 4);
                const month = str.substring(4, 6);
                return `${month}-${year}`; // MM-YYYY format
            };

            fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            })
                .then(r => r.json())
                .then(data => {
                    //  console.log("COST Data :", data);

                    const rows = data.data || [];
                    //   console.log("COST Row Data : ",rows);



                    const costObj = this.getView().getModel("costObj");
                    costObj.setProperty("/getCostData", rows);

                    const monthYear = (date) => {
                        const year = date.getFullYear();
                        const month = (`0${date.getMonth() + 1}`).slice(-2);

                        return `${month}-${year}`;

                    };

                    if (rows.length === 0) {
                        MessageBox.error(
                            `No Data Found with From Date ${monthYear(fromDateObj)} and To Date ${monthYear(toDateObj)}`
                        );
                        return;
                    }

                    if (rows.length !== 0) {
                        this.byId("costFilterBar").setVisible(true);
                        this.byId("costDescBlock").setVisible(true);
                        this.byId("costTable").setVisible(true);
                        this.byId("costDetailPanel").setVisible(true);
                    }

                    rows.forEach(item => {
                        item.reportYearMonthFormatted = formatReportYearMonth(item.reportYearMonth);
                    });

                    costObj.setProperty("/originalData", rows);
                    costObj.setProperty("/getCostData", rows);

                    //    console.log("Cost Data : ", rows);

                    costObj.setProperty("/costGlobalAccount", getUniqueClean(rows, "globalAccountName"));
                    costObj.setProperty("/costSubaccount", getUniqueClean(rows, "subaccountName"));
                    costObj.setProperty("/costServices", getUniqueClean(rows, "serviceName"));
                    costObj.setProperty("/costReportYearDate", getUniqueClean(rows, "reportYearMonthFormatted"));


                    const totalCost = rows.reduce((a, b) => a + (b.cost || 0), 0);
                    costObj.setProperty("/totalCost", Number(totalCost.toFixed(2)));
                    costObj.setProperty("/costCount", rows.length);

                    // Prepare charts
                    this._prepareServiceCostChart();
                    this._prepareSubaccountCostChart();
                    this._prepareCostMonthlyTrendChart();
                    this._preparePlanCostChart();
                })
                .catch(err => {
                    console.error(err);
                    sap.m.MessageToast.show("Failed to load data");
                })
                .finally(() => {
                    sap.ui.core.BusyIndicator.hide();
                });
        },


        _prepareServiceCostChart: function () {
            const costObj = this.getView().getModel("costObj");
            const rows = costObj.getProperty("/getCostData") || [];


            const serviceMap = {};

            rows.forEach(item => {
                const service = item.serviceName || "Unknown";
                const cost = item.cost || 0;

                if (!serviceMap[service]) {
                    serviceMap[service] = 0;
                }
                serviceMap[service] += cost;
            });

            const chartData = Object.entries(serviceMap).map(([service, total]) => {
                return {
                    ServiceName: service,
                    TotalCost: Number(total.toFixed(2))
                };
            });

            costObj.setProperty("/serviceCostChart", chartData);
        },

        _prepareSubaccountCostChart: function () {

            const costObj = this.getView().getModel("costObj");
            const rows = costObj.getProperty("/getCostData") || [];


            const subMap = {};

            rows.forEach(item => {
                const sub = item.subaccountName || "Unknown";
                const cost = item.cost || 0;

                if (!subMap[sub]) {
                    subMap[sub] = 0;
                }
                subMap[sub] += cost;
            });


            const total = Object.values(subMap).reduce((a, b) => a + b, 0);


            const chartData = Object.entries(subMap).map(([sub, cost]) => {
                return {
                    SubaccountName: sub,
                    Cost: Number(cost.toFixed(2)),
                    Percentage: total > 0 ? Number(((cost / total) * 100).toFixed(2)) : 0
                };
            });

            costObj.setProperty("/subaccountCostChart", chartData);
        },

        _prepareCostMonthlyTrendChart: function () {

            const costObj = this.getView().getModel("costObj");
            const rows = costObj.getProperty("/getCostData") || [];

            const monthMap = {};

            rows.forEach(item => {
                const month = item.reportYearMonthFormatted || "Unknown";
                const cost = item.cost || 0;

                if (!monthMap[month]) {
                    monthMap[month] = 0;
                }
                monthMap[month] += cost;
            });

            const chartData = Object.entries(monthMap).map(([month, cost]) => {
                return {
                    Month: month,
                    TotalCost: Number(cost.toFixed(2))
                };
            });


            chartData.sort((a, b) => a.Month.localeCompare(b.Month));

            costObj.setProperty("/monthlyTrendChart", chartData);
        },

        _preparePlanCostChart: function () {

            const costObj = this.getView().getModel("costObj");
            const rows = costObj.getProperty("/getCostData") || [];

            const planMap = {};

            rows.forEach(item => {
                const plan = item.planName || "Unknown";
                const cost = item.cost || 0;

                if (!planMap[plan]) {
                    planMap[plan] = 0;
                }
                planMap[plan] += cost;
            });


            const total = Object.values(planMap).reduce((a, b) => a + b, 0);


            const chartData = Object.entries(planMap).map(([plan, cost]) => ({
                PlanName: plan,
                Cost: Number(cost.toFixed(2)),
                Percentage: total > 0 ? Number(((cost / total) * 100).toFixed(2)) : 0
            }));

            costObj.setProperty("/planCostChart", chartData);
        },

        handleCostSelectionFinish: function () {
            const oTable = this.byId("costTable");
            if (!oTable) return;

            const oBinding = oTable.getBinding("rows");
            if (!oBinding) return;

            const globalKeys = this.byId("cGlobalAccount").getSelectedKeys();
            const subaccKeys = this.byId("cSubaccount").getSelectedKeys();
            const serviceKeys = this.byId("cService").getSelectedKeys();
            const spaceKeys = this.byId("cReportYearMonth").getSelectedKeys();

            console.log("Service : ", serviceKeys);
            const filters = [];

            const createMultiFilter = (keys, fieldName) => {
                if (keys.length > 0) {
                    const innerFilters = keys.map(key =>
                        new sap.ui.model.Filter(fieldName, sap.ui.model.FilterOperator.EQ, key)
                    );
                    return new sap.ui.model.Filter({
                        filters: innerFilters,
                        and: false
                    });
                }
                return null;
            };

            [createMultiFilter(globalKeys, "globalAccountName"),
            createMultiFilter(subaccKeys, "subaccountName"),
            createMultiFilter(serviceKeys, "serviceName"),
            createMultiFilter(spaceKeys, "reportYearMonthFormatted")]
                .forEach(f => { if (f) filters.push(f); });

            oBinding.filter(filters);


            this.updateActiveFilterTextOfCost();
            this.updateStatCardsOfCost();
        },

        updateActiveFilterTextOfCost: function () {

            const globalCount = this.byId("cGlobalAccount").getSelectedKeys().length;
            const subaccCount = this.byId("cSubaccount").getSelectedKeys().length;
            const serviceCount = this.byId("cService").getSelectedKeys().length;
            const spaceCount = this.byId("cReportYearMonth").getSelectedKeys().length;

            const totalCount = globalCount + subaccCount + serviceCount + spaceCount;

            this.byId("costFiltersText").setText("Active filters: " + totalCount + " selected");

            this.byId("costFilterBox").setVisible(totalCount > 0);

        },

        onPressClearFilterOfCost: function () {

            this.byId("cGlobalAccount").removeAllSelectedItems();
            this.byId("cSubaccount").removeAllSelectedItems();
            this.byId("cService").removeAllSelectedItems();
            this.byId("cReportYearMonth").removeAllSelectedItems();


            const oTable = this.byId("costTable");
            if (oTable) {
                const oBinding = oTable.getBinding("rows");
                if (oBinding) oBinding.filter([]);
            }

            this.updateActiveFilterTextOfUsage();
            this.byId("costFiltersText").setText("Active filters: 0 selected");
            this.byId("costFilterBox").setVisible(false);
            this.updateStatCardsOfCost();

        },

        _getFilteredCostData: function () {
            const oTable = this.byId("costTable");
            const oBinding = oTable.getBinding("rows");

            if (!oBinding) return [];


            return oBinding.aIndices.map(i => oBinding.oList[i]);
        },

       
        onPressLoadUsageData: function () {
            sap.ui.core.BusyIndicator.show(0);

            const fromDateObj = this.byId("fromDatePicker").getDateValue();
            const toDateObj = this.byId("toDatePicker").getDateValue();

            if (!fromDateObj || !toDateObj) {
                sap.ui.core.BusyIndicator.hide();
                sap.m.MessageToast.show("Select Both From Date And To Date");
                return;
            }

            if (fromDateObj > toDateObj) {
                sap.ui.core.BusyIndicator.hide();
                sap.m.MessageToast.show("From Date Always Greater Than To Date");
                return;
            }

            const fromDate = this._formatDateToYYYYMM(fromDateObj);
            const toDate = this._formatDateToYYYYMM(toDateObj);

            const payload = { fromDate, toDate };
            const oModel = this.getView().getModel("obj");


            const getUniqueClean = (arr, key) => {
                return [...new Set(
                    arr
                        .map(item => item[key])
                        .filter(v => v !== null && v !== undefined && v !== "")
                )].sort();
            };


            const formatReportYearMonth = (yyyymm) => {
                if (!yyyymm) return "";
                const str = yyyymm.toString();
                const year = str.substring(0, 4);
                const month = str.substring(4, 6);
                return `${month}-${year}`;
            };

            const url = this.getView().getModel().sServiceUrl;
            //  console.log("URL : ",url);
            const sUrl = url + "fetchUsage";
            //  console.log("sURL : ",sUrl);


            fetch(sUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            })
                .then(response => response.json())
                .then(data => {

                    // console.log("Data Usage : ",data);
                    const usageData = data.data || data.content || [];

                    usageData.forEach(item => {
                        item.ReportYearMonthFormatted = formatReportYearMonth(item.reportYearMonth);
                    });

                    oModel.setProperty("/getUsageData", usageData);
                    console.log("Usage Data : ", usageData);

                    const uniqueGlobalAccounts = getUniqueClean(usageData, "globalAccountName");
                    const uniqueServices = getUniqueClean(usageData, "serviceName");
                    const uniqueSubaccounts = getUniqueClean(usageData, "subaccountName");
                    const uniqueSpaces = getUniqueClean(usageData, "spaceName");
                    const uniqueApplications = getUniqueClean(usageData, "applicationName");
                    const uniqueUsage = getUniqueClean(usageData, "usage");


                    const totalUsage = Number(
                        usageData.reduce((sum, item) => sum + (item.usage || 0), 0).toFixed(2)
                    );


                    oModel.setProperty("/uniqueGlobalAccounts", uniqueGlobalAccounts);
                    oModel.setProperty("/uniqueServices", uniqueServices);
                    oModel.setProperty("/uniqueSubaccounts", uniqueSubaccounts);
                    oModel.setProperty("/uniqueSpaces", uniqueSpaces);
                    oModel.setProperty("/uniqueApplications", uniqueApplications);
                    oModel.setProperty("/uniqueUsage", uniqueUsage);
                    oModel.setProperty("/totalUsage", totalUsage);
                    oModel.setProperty("/filteredCount", usageData.length);

                    oModel.refresh(true);

                    //  this.byId("onLoadFilterBox").setVisible(false);
                    // this.byId("fromToDatePanel").setVisible(true);
                    this.byId("filterUserTable").setVisible(true);
                    this.byId("cardBox").setVisible(true);
                    this.byId("usagesDetailsPanel").setVisible(true);
                    this.byId("UsageTable").setVisible(true);


                    this._prepareUsageChart();
                    this._prepareUsageSubaccountChart();
                    this._prepareMonthlyUsageTrendChart();
                    this._prepareSpaceUsageChart();

                })
                .catch(err => {
                    console.error("API Error:", err);
                    sap.m.MessageToast.show("Failed to load data");
                })
                .finally(() => {
                    sap.ui.core.BusyIndicator.hide();
                });
        },


        _prepareUsageChart: function () {
            const obj = this.getView().getModel("obj");
            const rows = obj.getProperty("/getUsageData") || [];

            const usageMap = {};

            rows.forEach(item => {
                const service = item.serviceName || "Unknown";
                const usage = item.usage || 0;

                if (!usageMap[service]) {
                    usageMap[service] = 0;
                }
                usageMap[service] += usage;
            });

            const chartData = Object.entries(usageMap).map(([service, total]) => {
                return {
                    ServiceName: service,
                    TotalUsage: Number(total.toFixed(2))
                };
            });

            obj.setProperty("/usageChartData", chartData);
        },

        _prepareUsageSubaccountChart: function () {

            const oModel = this.getView().getModel("obj");
            const rows = oModel.getProperty("/getUsageData") || [];

            const subMap = {};

            rows.forEach(item => {
                const sub = item.subaccountName || "Unknown";
                const usage = item.usage || 0;

                if (!subMap[sub]) {
                    subMap[sub] = 0;
                }
                subMap[sub] += usage;
            });

            const total = Object.values(subMap).reduce((a, b) => a + b, 0);

            const chartData = Object.entries(subMap).map(([sub, value]) => {
                return {
                    SubaccountName: sub,
                    Usage: Number(value.toFixed(2)),
                    Percentage: total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0
                };
            });

            oModel.setProperty("/usageSubaccountChart", chartData);
        }
        ,

        _prepareMonthlyUsageTrendChart: function () {
            const obj = this.getView().getModel("obj");
            const rows = obj.getProperty("/getUsageData") || [];


            const monthMap = {};
            rows.forEach(item => {
                const month = item.ReportYearMonthFormatted || "Unknown";
                const usage = item.usage || 0;
                if (!monthMap[month]) monthMap[month] = 0;
                monthMap[month] += usage;
            });


            const chartData = Object.entries(monthMap)
                .sort(([a], [b]) => a.localeCompare(b)) // Sort months
                .map(([month, total]) => ({
                    Month: month,
                    TotalUsage: Number(total.toFixed(2))
                }));

            obj.setProperty("/monthlyUsageTrendChart", chartData);
        },
        _prepareSpaceUsageChart: function () {
            const obj = this.getView().getModel("obj");
            const rows = obj.getProperty("/getUsageData") || [];


            const spaceMap = {};
            rows.forEach(item => {
                const space = item.spaceName || "Null";
                const usage = item.usage || 0;
                if (!spaceMap[space]) spaceMap[space] = 0;
                spaceMap[space] += usage;
            });


            const totalUsage = Object.values(spaceMap).reduce((a, b) => a + b, 0);
            const chartData = Object.entries(spaceMap).map(([space, usage]) => ({
                SpaceName: space,
                Usage: Number(usage.toFixed(2)),
                Percentage: totalUsage > 0 ? Number(((usage / totalUsage) * 100).toFixed(2)) : 0
            }));

            obj.setProperty("/spaceUsageChart", chartData);
        }
        ,
        _formatDateToYYYYMM: function (date) {
            const year = date.getFullYear();
            const month = (`0${date.getMonth() + 1}`).slice(-2);
            return `${year}${month}`;
        },

        handleUsageSelectionFinish: function () {
            const oTable = this.byId("UsageTable");
            if (!oTable) return;

            const oBinding = oTable.getBinding("rows");
            if (!oBinding) return;

            const globalKeys = this.byId("uGAccount").getSelectedKeys();
            const subaccKeys = this.byId("uSubaccount").getSelectedKeys();
            const serviceKeys = this.byId("uService").getSelectedKeys();
            const spaceKeys = this.byId("uSpace").getSelectedKeys();
            const appKeys = this.byId("uApplication").getSelectedKeys();

            const filters = [];

            const createMultiFilter = (keys, fieldName) => {
                if (keys.length > 0) {
                    const innerFilters = keys.map(key =>
                        new sap.ui.model.Filter(fieldName, sap.ui.model.FilterOperator.EQ, key)
                    );
                    return new sap.ui.model.Filter({
                        filters: innerFilters,
                        and: false
                    });
                }
                return null;
            };

            [
                createMultiFilter(globalKeys, "globalAccountName"),
                createMultiFilter(subaccKeys, "subaccountName"),
                createMultiFilter(serviceKeys, "serviceName"),
                createMultiFilter(spaceKeys, "spaceName"),
                createMultiFilter(appKeys, "applicationName")
            ].forEach(f => { if (f) filters.push(f); });

            oBinding.filter(filters);

            this.updateActiveFilterTextOfUsage();
            this.updateStatCardsOfUsage();
        },



        onPressClearFilterOfUsage: function () {
            this.byId("uGAccount").removeAllSelectedItems();
            this.byId("uSubaccount").removeAllSelectedItems();
            this.byId("uService").removeAllSelectedItems();
            this.byId("uSpace").removeAllSelectedItems();
            this.byId("uApplication").removeAllSelectedItems();

            const oTable = this.byId("UsageTable");
            if (oTable) {
                const oBinding = oTable.getBinding("rows");
                if (oBinding) oBinding.filter([]);
            }

            this.updateActiveFilterTextOfUsage();
            this.byId("activeFiltersText").setText("Active filters: 0 selected");
            this.byId("activeFilterBox").setVisible(false);
            this.updateStatCardsOfUsage();
        }
        ,

        updateActiveFilterTextOfUsage: function () {

            const globalCount = this.byId("uGAccount").getSelectedKeys().length;
            const subaccCount = this.byId("uSubaccount").getSelectedKeys().length;
            const serviceCount = this.byId("uService").getSelectedKeys().length;
            const spaceCount = this.byId("uSpace").getSelectedKeys().length;
            const appCount = this.byId("uApplication").getSelectedKeys().length;

            const totalCount = globalCount + subaccCount + serviceCount + spaceCount + appCount;

            this.byId("activeFiltersText").setText("Active filters: " + totalCount + " selected");

            this.byId("activeFilterBox").setVisible(totalCount > 0);

        },

        _getFilteredUsageData: function () {
            const oTable = this.byId("UsageTable");
            const oBinding = oTable.getBinding("rows");

            if (!oBinding) return [];

            return oBinding.aIndices.map(i => oBinding.oList[i]);
        },

        updateStatCardsOfUsage: function () {

            let filteredData = this._getFilteredUsageData();
          //  console.log("Filter Data : ",filteredData);

            const oModel = this.getView().getModel("obj");


            if (filteredData.length === 0) {
                filteredData = oModel.getProperty("/getUsageData");
            }
            oModel.setProperty("/filteredCount", filteredData.length);


            const totalUsage = Number(
                filteredData.reduce((sum, item) => sum + (item.usage || 0), 0).toFixed(2)
            );

            oModel.setProperty("/totalUsage", totalUsage);

            const getUnique = (arr, key) =>
                [...new Set(arr.map(i => i[key]).filter(Boolean))];

            oModel.setProperty("/uniqueGlobalAccounts", getUnique(filteredData, "globalAccountName"));
            oModel.setProperty("/uniqueSubaccounts", getUnique(filteredData, "subaccountName"));
            oModel.setProperty("/uniqueServices", getUnique(filteredData, "serviceName"));
            oModel.setProperty("/uniqueSpaces", getUnique(filteredData, "spaceName"));
        },

        updateStatCardsOfCost: function () {

            let filteredData = this._getFilteredCostData();
            const oModel = this.getView().getModel("costObj");


            if (filteredData.length === 0) {
                filteredData = oModel.getProperty("/getCostData");
            }


            oModel.setProperty("/costCount", filteredData.length);


            const totalUsage = Number(
                filteredData.reduce((sum, item) => sum + (item.cost || 0), 0).toFixed(2)
            );
            oModel.setProperty("/totalCost", totalUsage);


        },

        onSegmentedButtonSelect: function (oEvent) {
            const selectedKey = oEvent.getParameter("key");

            if (selectedKey === "usage") {
                this.byId("usageGraphBox").setVisible(true);
                this.byId("costGraphBox").setVisible(false);

            } else if (selectedKey === "cost") {
                this.byId("costGraphBox").setVisible(true);
                this.byId("usageGraphBox").setVisible(false);

            }
        },


        onDownloadData: function (oEvent) {
            var that = this;

            const btnId = oEvent.getSource().getId();
            let tableID = null;

            if (btnId.includes("btnDownloadUsage")) {
                tableID = "UsageTable";
            } else if (btnId.includes("btnDownloadCost")) {
                tableID = "costTable";
            }

            console.log("Button ID :", btnId);
            console.log("Table ID :", tableID);

            // Create ActionSheet only once
            if (!this._oActionSheet) {
                this._oActionSheet = new sap.m.ActionSheet({
                    placement: sap.m.PlacementType.Top,
                    buttons: [
                        new sap.m.Button({
                            text: "Download as PDF",
                            press: function () {
                                that._downloadFile("pdf", that._currentTableId);
                            }
                        }),
                        new sap.m.Button({
                            text: "Download as Excel",
                            press: function () {
                                that._downloadFile("excel", that._currentTableId);
                            }
                        }),
                        new sap.m.Button({
                            text: "Download as CSV",
                            press: function () {
                                that._downloadFile("csv", that._currentTableId);
                            }
                        })
                    ]
                });
            }

            // 👉 Update table ID EVERY TIME here!
            this._currentTableId = tableID;

            this._oActionSheet.openBy(oEvent.getSource());
        }
        ,


        _getCurrentTableData: function (tableID) {
            console.log("Table ID in Current Data", tableID);

            var oTable = this.byId(tableID);
            if (!oTable) return [];

            var oBinding = oTable.getBinding("rows");
            if (!oBinding) return [];

            // Get total rows
            var iLength = oBinding.getLength();

            // Get ALL contexts, not only visible ones
            var aContexts = oBinding.getContexts(0, iLength);

            return aContexts.map(ctx => ctx.getObject());
        }
        ,

        _getVisibleColumns: function (tableID) {
            console.log("Table ID in Visible Data", tableID);
            var oTable = this.byId(tableID);
            var aCols = [];

            oTable.getColumns().forEach(function (col) {
                if (col.getVisible()) {
                    let key = col.getSortProperty();
                    let label = col.getLabel().getText();
                    aCols.push({ key: key, label: label });
                }
            });
            return aCols;
        },


        _downloadFile: function (sType, tableID) {
            console.log("Table ID in download  file : ", tableID);
            var aData = this._getCurrentTableData(tableID);
            if (!aData || !aData.length) {
                sap.m.MessageToast.show("No data to download");
                return;
            }
            var sTitle = "";
            if (tableID === "UsageTable")
                sTitle = "Usage_Report";
            else if (tableID === "costTable")
                sTitle = "Cost_Report";

            if (sType === "csv") {
                this._exportCSV(aData, sTitle, tableID);
            } else if (sType === "excel") {
                this._exportExcel(aData, sTitle, tableID);
            } else if (sType === "pdf") {
                this._exportPDF(aData, sTitle, tableID);
            }
        },


        _exportCSV: function (aData, sTitle, tableID) {
            var aVisibleCols = this._getVisibleColumns(tableID);

            var sCsv = aVisibleCols.map(c => c.label).join(",") + "\n";

            aData.forEach(function (oRow) {
                var aVals = aVisibleCols.map(c => oRow[c.key]);
                sCsv += aVals.join(",") + "\n";
            });

            var blob = new Blob([sCsv], { type: "text/csv;charset=utf-8;" });
            var link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = sTitle + ".csv";
            link.click();
        },


        _exportExcel: function (aData, sTitle, tableID) {
            var aVisibleCols = this._getVisibleColumns(tableID);

            var sExcel = '<table border="1"><tr>';
            aVisibleCols.forEach(c => sExcel += "<th>" + c.label + "</th>");
            sExcel += "</tr>";

            aData.forEach(function (oRow) {
                sExcel += "<tr>";
                aVisibleCols.forEach(c => {
                    sExcel += "<td>" + (oRow[c.key] || "") + "</td>";
                });
                sExcel += "</tr>";
            });

            sExcel += "</table>";

            var blob = new Blob([sExcel], { type: "application/vnd.ms-excel" });
            var link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = sTitle + ".xls";
            link.click();
        },

        onPressLoadAppCost: function () {
            sap.ui.core.BusyIndicator.show(0);

            const fromDateObj = this.byId("fromDatePickerAppCost").getDateValue();
            const toDateObj = this.byId("toDatePickerAppCost").getDateValue();

            if (!fromDateObj || !toDateObj) {
                sap.ui.core.BusyIndicator.hide();
                sap.m.MessageToast.show("Select Both From Date And To Date");
                return;
            }

            const fromDate = this._formatDateToYYYYMM(fromDateObj);
            const toDate = this._formatDateToYYYYMM(toDateObj);
            const url = this.getView().getModel().sServiceUrl + "fetchAppCost";
            const appCostModel = this.getView().getModel("appCostModel");

            fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fromDate, toDate })
            })
                .then(r => r.json())
                .then(resp => {
                    const parsed = JSON.parse(resp.value);
                    if (parsed.error) {
                        MessageBox.error("Error: " + parsed.error + "\n\nRun 'cf login' to refresh your session.");
                        return;
                    }
                    const data = parsed.data || [];
                    const totalCost = data.reduce((s, r) => s + (r.estimatedCost || 0), 0);
                    const currency = data[0]?.currency || "EUR";

                    appCostModel.setProperty("/getAppCostData", data);
                    appCostModel.setProperty("/totalEstimatedCost", Number(totalCost.toFixed(2)));
                    appCostModel.setProperty("/currency", currency);
                    appCostModel.setProperty("/appCount", data.length);

                    this.byId("appCostStatCards").setVisible(true);
                    this.byId("appCostTable").setVisible(true);
                    this._generateAlerts();
                })
                .catch(err => {
                    console.error("App cost error:", err);
                    sap.m.MessageToast.show("Failed to load app cost data");
                })
                .finally(() => sap.ui.core.BusyIndicator.hide());
        },

        onPressLoadAppsData: function () {
            sap.ui.core.BusyIndicator.show(0);

            const url = this.getView().getModel().sServiceUrl + "fetchApps";
            const appsModel = this.getView().getModel("appsModel");

            fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({})
            })
                .then(r => r.json())
                .then(resp => {
                    const parsed = JSON.parse(resp.value);
                    if (parsed.error) {
                        MessageBox.error("CF API error: " + parsed.error + "\n\nRun 'cf login' to refresh your session.");
                        return;
                    }
                    const data = parsed.data || [];

                    appsModel.setProperty("/getAppsData", data);
                    appsModel.setProperty("/totalApps", data.length);
                    appsModel.setProperty("/runningApps", data.filter(a => a.state === "STARTED").length);
                    appsModel.setProperty("/stoppedApps", data.filter(a => a.state !== "STARTED").length);

                    this.byId("appsStatCards").setVisible(true);
                    this.byId("appsTable").setVisible(true);
                    this._generateAlerts();
                })
                .catch(err => {
                    console.error("Apps fetch error:", err);
                    sap.m.MessageToast.show("Failed to load CF apps data");
                })
                .finally(() => {
                    sap.ui.core.BusyIndicator.hide();
                });
        },

        _generateAlerts: function () {
            var aAlerts = [];
            var oAppsModel = this.getView().getModel("appsModel");
            var oAppCostModel = this.getView().getModel("appCostModel");

            // Scan CF apps for stopped / high memory
            var aApps = oAppsModel.getProperty("/getAppsData") || [];
            aApps.forEach(function (app) {
                app.highlight = "None";
                app.highlightText = "";

                if (app.state === "STOPPED") {
                    aAlerts.push({
                        title: "App Stopped: " + app.name,
                        description: "'" + app.name + "' in space '" + app.spaceName + "' is currently stopped.",
                        priority: "High"
                    });
                    app.highlight = "Error";
                    app.highlightText = "App is stopped";
                } else if (app.memoryMB > 0 && app.memoryQuotaMB > 0) {
                    var memPct = app.memoryMB / app.memoryQuotaMB;
                    if (memPct > 0.8) {
                        aAlerts.push({
                            title: "High Memory: " + app.name,
                            description: "'" + app.name + "' is using " + Math.round(memPct * 100) + "% of its memory quota.",
                            priority: "Medium"
                        });
                        app.highlight = "Warning";
                        app.highlightText = "High memory usage";
                    }
                }
            });
            oAppsModel.setProperty("/getAppsData", aApps);

            // Scan app cost for high spend
            var aCosts = oAppCostModel.getProperty("/getAppCostData") || [];
            aCosts.forEach(function (app) {
                app.highlight = "None";
                app.highlightText = "";

                if (app.estimatedCost > 50) {
                    aAlerts.push({
                        title: "High Cost: " + app.name,
                        description: "'" + app.name + "' has an estimated cost of " + app.estimatedCost + " " + app.currency + ".",
                        priority: "High"
                    });
                    app.highlight = "Error";
                    app.highlightText = "High estimated cost";
                } else if (app.estimatedCost > 20) {
                    aAlerts.push({
                        title: "Elevated Cost: " + app.name,
                        description: "'" + app.name + "' has an estimated cost of " + app.estimatedCost + " " + app.currency + ".",
                        priority: "Medium"
                    });
                    app.highlight = "Warning";
                    app.highlightText = "Elevated cost";
                }
            });
            oAppCostModel.setProperty("/getAppCostData", aCosts);

            this.getView().getModel("alerts").setProperty("/alerts", aAlerts);
            this.getView().getModel("alerts").setProperty("/count", aAlerts.length);
        },

        onAlertBellPress: function (oEvent) {
            var oButton = oEvent.getSource();
            var aAlerts = this.getView().getModel("alerts").getProperty("/alerts") || [];

            if (this._oAlertPopover) {
                this._oAlertPopover.destroy();
                this._oAlertPopover = null;
            }

            var aContent = [];
            if (aAlerts.length === 0) {
                var oBox = new sap.m.VBox({
                    items: [
                        new sap.m.Icon({ src: "sap-icon://accept", size: "2rem", color: "Positive" }),
                        new sap.m.Text({ text: "No alerts at this time." })
                    ],
                    alignItems: "Center",
                    justifyContent: "Center"
                });
                oBox.addStyleClass("sapUiMediumMargin");
                aContent.push(oBox);
            } else {
                var oList = new sap.m.NotificationList();
                aAlerts.forEach(function (alert) {
                    oList.addItem(new sap.m.NotificationListItem({
                        title: alert.title,
                        description: alert.description,
                        priority: alert.priority === "High" ? "High" : "Medium",
                        showCloseButton: false,
                        unread: true
                    }));
                });
                aContent.push(oList);
            }

            this._oAlertPopover = new sap.m.Popover({
                title: "Notifications" + (aAlerts.length > 0 ? " (" + aAlerts.length + ")" : ""),
                placement: sap.m.PlacementType.Bottom,
                contentWidth: "400px",
                content: aContent,
                endButton: new sap.m.Button({
                    text: "Dismiss All",
                    press: function () {
                        this.getView().getModel("alerts").setProperty("/alerts", []);
                        this.getView().getModel("alerts").setProperty("/count", 0);
                        this._oAlertPopover.close();
                    }.bind(this)
                })
            });

            this._oAlertPopover.openBy(oButton);
        },

        _exportPDF: function (aData, sTitle, tableID) {
            var aVisibleCols = this._getVisibleColumns(tableID);

            function esc(s) {
                return (s || "").toString().replace(/[&<>"']/g, c =>
                    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
                );
            }

            var sTable = "<table><thead><tr>";
            aVisibleCols.forEach(c => sTable += "<th>" + esc(c.label) + "</th>");
            sTable += "</tr></thead><tbody>";

            aData.forEach(function (oRow) {
                sTable += "<tr>";
                aVisibleCols.forEach(c => sTable += "<td>" + esc(oRow[c.key] || "") + "</td>");
                sTable += "</tr>";
            });
            sTable += "</tbody></table>";

            var sHTML = `
                <html>
                    <head>
                        <style>
                            @page {
                                size: A4 landscape;
                                margin: 20px;
                            }

                            * {
                                -webkit-print-color-adjust: exact !important;
                                print-color-adjust: exact !important;
                            }

                            body {
                                padding-bottom: 60px; 
                                font-family: Arial, sans-serif;
                            }

                            table { 
                                width: 100%; 
                                border-collapse: collapse; 
                            }

                            tr {
                                page-break-inside: avoid !important;
                                break-inside: avoid !important;
                            }

                            th { 
                                background: #333 !important;
                                color: #fff !important;
                                font-weight: bold;
                                padding: 8px;
                                border: 1px solid #000;
                                text-align: left;
                            }

                            td { 
                                border: 1px solid #000; 
                                padding: 6px; 
                                vertical-align: top;
                                color: #000;
                            }

                        </style>
                    </head>
                    <body>
                        <h2>${esc(sTitle)}</h2>
                        ${sTable}
                    </body>
                </html>
            `;

            var iframe = document.createElement("iframe");
            iframe.style.width = "0";
            iframe.style.height = "0";
            document.body.appendChild(iframe);

            iframe.contentDocument.open();
            iframe.contentDocument.write(sHTML);
            iframe.contentDocument.close();

            setTimeout(() => {
                iframe.contentWindow.print();
                document.body.removeChild(iframe);
            }, 500);
        }




    });
});