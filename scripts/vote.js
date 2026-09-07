// Hardhat script: `npm run vote` (or `VOTE=yes npm run vote`).
const hre = require("hardhat");
const { castVote } = require("./cli");

castVote(hre)
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
