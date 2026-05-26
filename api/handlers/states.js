const { json } = require('../lib/http');
const service = require('../services/hospital-service');

async function listStates(req, res) {
  const states = await service.listStates();
  json(res, 200, { states });
}

async function getState(req, res, stateCode) {
  const row = await service.getState(stateCode);
  json(res, 200, row);
}

module.exports = { listStates, getState };
