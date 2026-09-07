// `npm run get-ticket` (or `VOTER=0x... npm run get-ticket`).
const { downloadTicket } = require("./cli");

downloadTicket()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
