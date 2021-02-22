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

    console.log(JSON.stringify(data.pdu.varbinds, null, 2));
  };

  agent = snmp.createAgent(snmpOptions, callback);
  authorizer = agent.getAuthorizer();
  authorizer.addCommunity("public");
  mib = agent.getMib();

  await require("./snmp-if")(
    agent,
    "Hello Linux!",
    "1.3.6.1.4.1.56827.1.1",
    "Derrell Lipman, derrell.lipman@unwireduniverse.com",
    "Agent example",
    "Testing lab",
    Math.pow(2, 3-1));            // layer 3

  // scalarProvider =
  //   {
  //     name: "sysDescr",
  //     type: snmp.MibProviderType.Scalar,
  //     oid: "1.3.6.1.2.1.1.1",
  //     scalarType: snmp.ObjectType.OctetString,
  //     maxAccess: snmp.MaxAccess['read-write']
  //   };
  // agent.registerProvider(scalarProvider);

  tableProvider =
    {
      name: "ifTable",
      type: snmp.MibProviderType.Table,
      oid: "1.3.6.1.2.1.2.2.1",
      maxAccess: snmp.MaxAccess['not-accessible'],
      tableColumns:
      [
        {
          number: 1,
          name: "ifIndex",
          type: snmp.ObjectType.Integer,
          maxAccess: snmp.MaxAccess['read-only']
        },
        {
          number: 2,
          name: "ifDescr",
          type: snmp.ObjectType.OctetString,
          maxAccess: snmp.MaxAccess['read-write'],
          defVal: "Hello world!"
        },
        {
          number: 3,
          name: "ifType",
          type: snmp.ObjectType.Integer,
          maxAccess: snmp.MaxAccess['read-only'],
          constraints: {
            enumeration: {
              "1": "goodif",
              "2": "badif",
              "6": "someif",
              "24": "anotherif"
            }
          },
          defVal: 6
        },
        {
          number: 99,
          name: "ifStatus",
          type: snmp.ObjectType.Integer,
          maxAccess: snmp.MaxAccess['read-write'],
          rowStatus: true
        }
      ],
      tableIndex:
      [
        {
          columnName: "ifIndex"
        }
      ],
      handler: function ifTable(mibRequest)
      {
        // e.g. can update the table before responding to the request here
        mibRequest.done();
      }
    };
  agent.registerProvider(tableProvider);

  mib.setScalarValue("sysDescr", "hi there");


  mib.dump(
    {
      leavesOnly: false,
      showProviders: true,
      showValues: true,
      showTypes: true
    });
}

(async () => await agent())();
