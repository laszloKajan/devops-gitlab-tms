const axios = require('axios');
var express = require('express');
var router = express.Router();

/* GET /v2/nodes listing. */
router.get('/', function (req, res, next) {
    res.send({
        "nodes": [
            {
                "id": 1,
                "description": "Development",
                "name": "DGT",
                "uploadAllowed": true,
                "notificationEnabled": false,
                "forwardMode": "MANUAL",
                "importDisabled": false,
                "importDisabledReason": "",
                "targets": [
                    {
                        "id": 10001,
                        "contentType": "MTA",
                        "destinationName": "Development",
                        "importOptions": {
                            "strategy": "default"
                        }
                    }
                ]
            },
            {
                "id": 2,
                "description": "Test",
                "name": "TGT",
                "uploadAllowed": false,
                "notificationEnabled": false,
                "forwardMode": "AUTO",
                "controlledBy": "CHARM",
                "importDisabled": false,
                "importDisabledReason": "",
                "targets": [
                    {
                        "id": 10002,
                        "contentType": "MTA",
                        "destinationName": "Test",
                        "importOptions": {
                            "strategy": "default"
                        }
                    }
                ]
            },
            {
                "id": 3,
                "description": "Quality",
                "name": "QGT",
                "uploadAllowed": false,
                "notificationEnabled": false,
                "forwardMode": "AUTO",
                "controlledBy": "CHARM",
                "importDisabled": false,
                "importDisabledReason": "",
                "targets": [
                    {
                        "id": 10003,
                        "contentType": "MTA",
                        "destinationName": "Quality",
                        "importOptions": {
                            "strategy": "default"
                        }
                    }
                ]
            },
            {
                "id": 4,
                "description": "Production",
                "name": "PGT",
                "uploadAllowed": false,
                "notificationEnabled": false,
                "forwardMode": "AUTO",
                "controlledBy": "CHARM",
                "importDisabled": false,
                "importDisabledReason": "",
                "targets": [
                    {
                        "id": 10004,
                        "contentType": "MTA",
                        "destinationName": "Production",
                        "importOptions": {
                            "strategy": "default"
                        }
                    }
                ]
            }
        ]
    });
});

// API https://api.sap.com/api/TMS_v2/resource
//  GET /v2/nodes/2/transportRequests?status=in
//  GET /v2/nodes/{nodeId}/transportRequests?status={in,ru,re,su,wa,er,fa,de}
router.get('/:nodeId(\\d+)/transportRequests', async function (req, res, next) {

    // req.params.nodeId - will always be >2< given the nodes above
    // req.query.status - will always be 'in'
    const glProjects = JSON.parse(process.env.GITLAB_PROJECTS); // [4396]
    let transportRequestPosition = 1;

    let promises = glProjects.map(glProjectId => {
        const tagsUrl = `https://${process.env.GITLAB_HOST}/api/v4/projects/${glProjectId}/repository/tags?search=^v`;
        return axios.get(tagsUrl, {
            headers: { 'Authorization': `Bearer ${process.env.GITLAB_ACCESS_READ_API}` }
        });
    });

    let responses = await Promise.all(promises);

    const transportRequests = responses.reduce((acc, response) => {
        const _transportRequests = response.data.map((elem) => {
            // Map commit to tr. req. id:
            //  Convert first 13 characters (52 bits) of commit to transport request id, which 53 bits precision:
            //  parseInt("1dabe74c48a320db1d3c8a04d7fba4ec4025097f".substr(0, 13), 16)
            function commit2id(__commit) { return parseInt(__commit.substr(0, 13), 16); }
            const trId = commit2id(elem.commit.id);
            const trEntryId = commit2id(elem.commit.short_id);
            const trDescription = `project: 4396, tag: ${elem.name}, commit: ${elem.commit.id}`.
                replace(/[^\w ._~:\/?#[\]@!$&()*+,;=%-]/g, '_'); // C.f. devops-scripts/tms-upload

            return {
                "id": trId,           // integer($int64) in the API definition, but we really have only 53 bits, see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER
                "status": "initial",
                "archived": false,
                "position": transportRequestPosition++,
                "createdBy": elem.commit.committer_email,
                "createdAt": elem.commit.committed_date,    // "2021-04-14T12:24:41.000+00:00"
                "description": trDescription,
                "origin": "DGT",                            // /dev/ node!
                "entries": [
                    {
                        "id": trEntryId,
                        "storageType": "FILE",
                        "contentType": "MTA",
                        "uri": `${trEntryId}`   // "4378"
                    }
                ]
            };
        });

        return acc.concat(_transportRequests);
    }, []);

    res.send({
        "transportRequests": transportRequests
    });
});

module.exports = router;
