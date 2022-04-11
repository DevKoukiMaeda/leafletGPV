const { contextBridge } = require("electron");
const fs = require('fs');
const gpvpath = "CDF/MSM-S.nc";

contextBridge.exposeInMainWorld(
  "requires", {
  LoadCDF: () => {
    
    var GPV = fs.readFileSync(gpvpath);
    return GPV;
  }
});