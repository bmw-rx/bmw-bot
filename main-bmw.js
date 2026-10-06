// BMW LITE primary entrypoint.
// The runtime stays modular internally, while this stable filename is used by
// CLI and hosting providers to start the complete bot.
require("./index");

module.exports = {
    start: () => require("./lib/botManager").startBot(),
};

