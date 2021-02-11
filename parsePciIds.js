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

const           fsp = require("fs").promises;

/**
 * Parse the PCI ID database into a map
 *
 * @param pciIdPath {String]
 *   The full path to the PCI ID datbase file
 */
module.exports = async function(pciIdPath)
{
  let             lines;
  let             pciIds = {};
  let             classes = {};
  let             manufacturerId;

  return Promise.resolve()
    .then(() => fsp.readFile(pciIdPath))
    .then((contents) => contents.toString().split("\n"))
    .then(
      (lines) =>
      {
        let             filtered = [];
        let             inDeviceClasses = false;

        // Filter out all undesirable lines
        lines.reduce(
          (accumulator, line) =>
          {
            // Ignore all lines as soon as device classes begin
            if (inDeviceClasses)
            {
              return accumulator;
            }

            // Ignore:
            if (line.charAt(0) == "#" || // comments
                line.length === 0 ||     // blank lines
                line.startsWith("\t\t")) // subIds (two leading tabs)
            {
              return accumulator;
            }

            // Is this a device class definition?
            if (line.startsWith("C "))
            {
              // Yup. We'll ignore from here on out
              inDeviceClasses = true;
              return accumulator;
            }

            // We'll use this line
            accumulator.push(line);
            return accumulator;
          },
          filtered);

        return filtered;
      })
    .then(
      (lines) =>
      {
        lines.forEach(
          (line) =>
          {
            let             _;  // something to ignore
            let             device;
            let             deviceId;
            let             manufacturer;

            // Is this a new manufacturer ID? (and not a device Class)
            if (line.charAt(0) != "\t" && ! line.startsWith("C "))
            {
              // Yup. Extract the manufacturer ID and name from the line
              [ _, manufacturerId, manufacturer ] =
                line.match(/^([0-9a-f]+) *(.*)/);
              pciIds[manufacturerId] =
                {
                  manufacturer : manufacturer,
                  devices : {}
                };
              return;
            }

            // We have a device entry. Extract the deviceId and name
            // from the line
            [ _, deviceId, device ] = line.match(/^\t([0-9a-f]+) *(.*)/);
            pciIds[manufacturerId].devices[deviceId] = device;
          });
      })
    .then(() => pciIds);
};

