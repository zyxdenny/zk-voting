const { downloadTicket } = require('./cli');

downloadTicket()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
