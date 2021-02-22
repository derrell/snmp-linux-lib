/**
 ** (C) Copyright 2021 Derrell Lipman
 ** All Rights Reserved
 **
 **   License:
 **     MIT: https://opensource.org/licenses/MIT
 **     See the LICENSE file in the project's top-level directory for details.
 **
 ** Author: Derrell Lipman
 */

'use strict';


async function agent()
{
  let             mib;
  let             agent;
  let             callback;
  let             authorizer;
  let             snmpOptions;
  let             scalarProvider;
  let             tableProvider;
  const           snmp = require ("net-snmp");
  const           fs = require("fs");

  snmpOptions =
    {
      port: 1611,
      address: null,
      accessControlModelType: snmp.AccessControlModelType.Simple
    };

  callback =
    (error, data) =>
  {
    if (error)
    {
      console.error(error);
      return;
    }

//    console.log(JSON.stringify(data.pdu.varbinds, null, 2));
  };

  agent = snmp.createAgent(snmpOptions, callback);
  authorizer = agent.getAuthorizer();
  authorizer.addCommunity("public");
  mib = agent.getMib();

  await require("./node-net-snmp-if")(
    agent,
    "Hello Linux!",
    "1.3.6.1.4.1.999999.1.1",
    "Derrell Lipman",
    "Agent example",
    "Testing lab",
    Math.pow(2, 3-1) + Math.pow(2, 4-1));            // layer 3+4

/*
  mib.dump(
    {
      leavesOnly: false,
      showProviders: true,
      showValues: true,
      showTypes: true
    });
*/
}

(async () => await agent())();
