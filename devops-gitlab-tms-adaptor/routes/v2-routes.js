var express = require('express');
var router = express.Router();

/* GET /v2/routes listing. */
router.get('/', function (req, res, next) {
    res.send({
        "routes": [
            {
                "id": 102,
                "description": null,
                "name": "DGT_TGT",
                "sourceNodeId": 1,
                "targetNodeId": 2
            },
            {
                "id": 203,
                "description": null,
                "name": "TGT_QGT",
                "sourceNodeId": 2,
                "targetNodeId": 3
            },
            {
                "id": 304,
                "description": null,
                "name": "QGT_PGT",
                "sourceNodeId": 3,
                "targetNodeId": 4
            }
        ]
    });
});

module.exports = router;
