'use strict';

const Compute = require('@google-cloud/compute');

const compute = new Compute();
const {
    NETWORK_QUARANTINE_TAG,
    VPC_NAME
} = process.env;

var VPCName;
var vm;
var zoneid;
var src_ip;

async function getVms() {

    const options = {
        // Filter Options can be found here:
        // https://cloud.google.com/nodejs/docs/reference/compute/0.10.x/Compute#getVMs
    };
    try {
        console.log('Fetching VMs');
        const [vms] = await compute.getVMs(options);
        return vms;
    } catch (err) {
        console.log(err);
        throw err;
    }
}

function splitURL(indexItem) {
    var lastindex = indexItem.lastIndexOf('/');
    var result = indexItem.substring(lastindex + 1);
    return result;
}

function findMatchingVM(src_ip, vms) {
    for (let vmData of vms) {
        for (let networkData of vmData.metadata.networkInterfaces) {
            VPCName = splitURL(networkData.network);
            try {
                if (networkData.accessConfigs && networkData.accessConfigs[0].natIP === src_ip && VPCName === VPC_NAME) {
                    zoneid = compute.zone(splitURL(vmData.metadata.zone));
                    vm = zoneid.vm(vmData.name);
                    return vm;
                } else if (networkData.networkIP === src_ip && VPCName === VPC_NAME) {
                    zoneid = compute.zone(splitURL(vmData.metadata.zone));
                    vm = zoneid.vm(vmData.name);
                    return vm;
                }
            } catch (err) {
                console.log(err);
            }
        }

    }

}
exports.main = async function(req, res) {
    try {
        src_ip = req.body.data.rawlog.srcip;
    } catch (err) {
        console.log(`Error Retrieving the Source IP${err}`);
    }
    console.log(`IP received: ${src_ip}`);
    if (NETWORK_QUARANTINE_TAG === null) {
        console.log('No NETWORK_QUARANTINE_TAG detected. Please add a tag to update');
        res.sendStatus(500);
        return;
    }
    let vms;
    try {
        vms = await getVms();
        vm = findMatchingVM(src_ip, vms);
    } catch (ex) {
        res.send(500, ex.message);
        return;
    }

    if (vm != null) {
        // Must Retrive the tags and Fingerprint in order to update.
        var tagData = await vm.getTags();
        var fingerPrint = tagData[1];
        var tags = tagData[0];

        if (tags == null) {
            tags = [];
        }
        if (tags.length >= 64) {
            console.log('Max number of tags exceeded on VM. Can not add Tag');
            res.sendStatus(500);
            return;
        }
        for (let item of tags) {
            if (item === NETWORK_QUARANTINE_TAG) {
                console.log(`Tag already defined on VM${vm.id}`);
                res.send(409, {message: `Tag ${NETWORK_QUARANTINE_TAG} already defined on VM ${vm.id}`});
                return;
            }
        }

        tags.push(NETWORK_QUARANTINE_TAG);

        try {
            await vm.setTags(tags, fingerPrint);
            console.log(`Updated Network Tag for ${src_ip}`);
            console.log('Function Complete');
            res.sendStatus(200);
        } catch (err) {
            console.log(`Error Updating Tags: ${err}`);
            res.sendStatus(500);
        }
    } else {
        console.log('Failed to find Instance');
        res.sendStatus(404);
    }

};

if (module === require.main) {
    exports.main(console.log);
}
