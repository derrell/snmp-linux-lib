# snmp-linux-lib
Dynamic MIB support for Linux computers, etc.

This package provides an add-on to a
[node-net-snmp](https://github.com/markabrahams/node-net-snmp/) SNMP
agent, that implements most of RFC1213-MIB's defined IPv4 OIDs, and
most of IPV6-MIB's IPV6 OIDs. It obtains the information from /proc
and /sys information on a Linux system.

The system interface is implemented in `core.js`. Those facilities are then made available as SNMP objects by `node-net-snmp-if.js`.

The file `example.js` show how to create a `node-net-snmp` agent that incorporates these facilities.

To run the example code:
```
npm install
node example.js
```

Then, to display all information:

```
snmpwalk -v2c -c public localhost:1611 1.3.6.1.2.1
```

(Writing to the read-write objects has no practical effect. This
package is focused on reading, not writing, at this time.)
