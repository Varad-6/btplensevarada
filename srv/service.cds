service uasService {
    action fetchUsage(fromDate: String, toDate: String) returns String;
    action fetchCost(fromDate: String, toDate: String) returns String;
    action fetchApps() returns String;
    action fetchAppCost(fromDate: String, toDate: String) returns String;
}
