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


/*
 * Run this, and then walk the tree with:
 *
 * snmpwalk -v2c -c public localhost:1611 1.3.6.1.2.1
 */
async function startAgent()
{
  let             mib;
  let             agent;
  let             authorizer;
  let             scalarProvider;
  let             tableProvider;
  const           snmp = require ("net-snmp");
  const           fs = require("fs");

  agent = snmp.createAgent(
    {
      port: 1611,
      address: null,
      accessControlModelType: snmp.AccessControlModelType.Simple
    },
    (error, data) =>
    {
      if (error)
      {
        console.error(error);
        return;
      }

//      console.log("Agent: " + JSON.stringify(data.pdu.varbinds, null, "  "));
    });
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
}

(async () => await startAgent())();
