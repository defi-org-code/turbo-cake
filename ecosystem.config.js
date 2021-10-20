module.exports = {
  apps : [{
    name   : "contracts",
    script : "./main.js",
    args: "--prod=true",
    max_restarts: 3,
    min_uptime: 1800000	  
  }]
}