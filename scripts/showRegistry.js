// `npm run registry`
const { showRegistry } = require("./cli");

showRegistry()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
