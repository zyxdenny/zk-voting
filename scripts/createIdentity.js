// `npm run identity`
const { createIdentity } = require("./cli");

createIdentity()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
