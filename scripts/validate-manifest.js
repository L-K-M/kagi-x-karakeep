const fs = require("fs");

JSON.parse(fs.readFileSync("manifest.json", "utf8"));
console.log("manifest.json is valid JSON");
