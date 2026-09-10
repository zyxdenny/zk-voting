// `npm run register`
const { registerIdentity } = require("./cli");

registerIdentity()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
