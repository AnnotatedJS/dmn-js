import inherits from 'inherits';

import BaseLayouter from 'diagram-js/lib/layout/BaseLayouter';

import {
  getMid,
  getOrientation
} from 'diagram-js/lib/layout/LayoutUtil';

import { is } from 'dmn-js-shared/lib/util/ModelUtil';

export default function DrdLayouter(connectionDocking) {
  this._connectionDocking = connectionDocking;
}

inherits(DrdLayouter, BaseLayouter);

DrdLayouter.$inject = [ 'connectionDocking' ];


DrdLayouter.prototype.layoutConnection = function(connection, hints) {

  hints = hints || {};

  var source = hints.source || connection.source,
      target = hints.target || connection.target,
      waypoints = hints.waypoints || connection.waypoints,
      start = hints.connectionStart,
      end = hints.connectionEnd,
      middle;

  waypoints = waypoints || [];

  middle = waypoints.slice(1, waypoints.length - 1);

  if (!start) {
    start = getConnectionDocking(waypoints && waypoints[0], source);
  }

  if (!end) {
    end = getConnectionDocking(waypoints && waypoints[waypoints.length - 1], target);
  }

  var orientation;

  if (is(connection, 'dmn:InformationRequirement')) {
    orientation = getOrientation(connection.source, connection.target);

    // console.log('orientation', orientation);

    waypoints = [ start ].concat([ end ]);

    var connectionWaypoints = connection.waypoints;

    connection.waypoints = waypoints;

    var croppedWaypoints = this._connectionDocking.getCroppedWaypoints(connection);

    connection.waypoints = connectionWaypoints;

    end = croppedWaypoints.pop();

    var additionalWaypoint;

    if (orientation.includes('bottom')) {
      additionalWaypoint = { x: end.x, y: end.y + 20 };
    } else if (orientation.includes('top')) {
      additionalWaypoint = { x: end.x, y: end.y - 20 };
    } else if (orientation.includes('right')) {
      additionalWaypoint = { x: end.x + 20, y: end.y };
    } else {
      additionalWaypoint = { x: end.x - 20, y: end.y };
    }

    waypoints = croppedWaypoints.concat([ additionalWaypoint, end ]);

    // console.log('waypoints', waypoints);

    return waypoints;
  }

  return [ start ].concat(middle, [ end ]);
};

function getConnectionDocking(point, shape) {
  return point ? (point.original || point) : getMid(shape);
}
