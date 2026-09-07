// Hardhat script: `npm run results`.
const hre = require("hardhat");
const { showResults } = require("./cli");

showResults(hre)
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
