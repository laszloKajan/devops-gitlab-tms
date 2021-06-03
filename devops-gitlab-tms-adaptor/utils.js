var utils = {
    //  Convert first 13 characters (52 bits) of commit to transport request id, which is 53 bits precision:
    //  parseInt("1dabe74c48a320db1d3c8a04d7fba4ec4025097f".substr(0, 13), 16)
    commit2id: function (__commit) { return parseInt(__commit.substr(0, 13), 16); },

    getGlProjects: function () { return JSON.parse(process.env.GITLAB_PROJECTS); },

    getTmStatus: function (glStatus) {
        switch (glStatus) {
            case 'created':
            case 'pending':
                return 'initial';
            case 'manual':
            case 'running':
                return 'running';
            case 'failed':
                return 'error';
            case 'success':
                return 'succeeded';
            case 'canceled':
            case 'skipped':             // A job is 'skipped' when an earlier dependency is 'failed'.
                return 'fatal';
            default:
                return 'unknown';
        }
    },

    sleep: function (ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
};

module.exports = utils;