'use strict';
const axios = require('axios');
var debug = require('debug')('devops-gitlab-tms-adaptor:routes-v2-actions');
var express = require('express');
var router = express.Router();
var utils = require('../utils');

// GET /v2/actions/:jobId(\\d+)
router.get('/:jobId(\\d+)', async function (req, res, next) {
    try {                                                       // https://expressjs.com/en/guide/error-handling.html
        // TODO: Implement bearer token policy.

        const jobId = req.params.jobId;
        const glProjects = utils.getGlProjects(); // [4396]
        let promises = glProjects.map(glProjectId => {
            const jobsUrl = `https://${process.env.GITLAB_HOST}/api/v4/projects/${glProjectId}/jobs/${jobId}`;
            debug(`axios GET ${jobsUrl}`);
            return axios.get(jobsUrl, {
                headers: { 'Authorization': `Bearer ${process.env.GITLAB_ACCESS_API}` },
                validateStatus: function (status) { return true; } // any response is a success: https://github.com/axios/axios
            });
        });

        let responses = await Promise.all(promises);
        let successResponses = responses.filter(response => response.status === 200);
        if (successResponses.length < 1) { throw new Error(`could not find job ${jobId}`); }
        if (successResponses.length > 1) { throw new Error(`found commit ${jobId} in more than one project`); }

        const response = successResponses[0];

        const trEntryId = utils.commit2id(response.data.commit.short_id);
        const tmStatus = utils.getTmStatus(response.data.status);

        function getNodeNameFromJobName(__name) {
            // Look it up in https://code.roche.com/sap-aspire/scp/supporting-projects/devops-mbt-pipeline/-/blob/master/.gitlab-ci-roche-btp-flow.yml
            // TODO: parametrize this
            switch (__name) {
                case 'deploy to Test': // Not exactly elegant... we could do something via the environments interface.
                    return 'TGT';
                case 'deploy to Quality':
                    return 'QGT';
                case 'deploy to Production':
                    return 'PGT';
                default:
                    return 'DGT';
            }
        }

        res.send(
            {
                "id": jobId,
                "type": "I",
                "status": tmStatus,
                "startedAt": response.data.started_at,
                "endedAt": response.data.finished_at,
                "triggeredBy": "d7ad0010-09a7-4916-be8d-1166c653e0c7", // TODO: take some ID from access token
                "triggeredByNamedUser": response.data.user.username,
                "nodeName": getNodeNameFromJobName(response.data.name),
                "transportRequests": [
                    {
                        "id": utils.commit2id(response.data.commit.id),
                        "status": tmStatus,
                        "entities": [
                            {
                                "id": trEntryId,
                                "fileName": `${trEntryId}.zip`,
                                "uri": `${trEntryId}`,
                                "status": tmStatus
                            }
                        ]
                    }
                ]
            }
        );
    } catch (err) {
        next(err);
    }
});

module.exports = router;
