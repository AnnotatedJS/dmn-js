import {
  assign,
  forEach
} from 'min-dash';

import inherits from 'inherits';

import {
  remove as collectionRemove,
  add as collectionAdd
} from 'diagram-js/lib/util/Collections';

import {
  is,
  isAny
} from 'dmn-js-shared/lib/util/ModelUtil';

import {
  getMid,
  getOrientation
} from 'diagram-js/lib/layout/LayoutUtil';

import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';


/**
 * Update DMN 1.3 information.
 */
export default function DrdUpdater(
    connectionDocking,
    definitionPropertiesView,
    drdFactory,
    drdRules,
    injector
) {
  injector.invoke(CommandInterceptor, this);

  this._definitionPropertiesView = definitionPropertiesView;
  this._drdFactory = drdFactory;
  this._drdRules = drdRules;

  var modeling = injector.get('modeling');

  var self = this;

  function isInformationRequirementWithSameOrientation(connection, orientation) {
    return is(connection, 'dmn:InformationRequirement')
      && getOrientation(connection.source, connection.target).split('-')[0] === orientation.split('-')[0];
  }

  function cropConnection(context) {
    var connection = context.connection,
        cropped = context.cropped;

    if (!is(connection, 'dmn:InformationRequirement') && !cropped) {
      connection.waypoints = connectionDocking.getCroppedWaypoints(connection);

      context.cropped = true;
    }

    var source = connection.source,
        target = connection.target;

    var orientation = getOrientation(source, target);

    var incoming = target.incoming,
        incomingInformationRequirements = incoming.filter(i => {
          return isInformationRequirementWithSameOrientation(i, orientation);
        });

    if (!incomingInformationRequirements.length) {
      return;
    }

    var dockingPoint,
        dockingPoints;

    var sourceMid = getMid(source);

    if (orientation.includes('bottom')) {
      incomingInformationRequirements = incomingInformationRequirements.sort((a, b) => {
        return getMid(a.source).x - getMid(b.source).x;
      });

      dockingPoints = incomingInformationRequirements.map((_, index) => {
        return {
          x: target.x + target.width / (incomingInformationRequirements.length + 1) * (index + 1),
          y: target.y + target.height
        };
      });

      dockingPoint = {
        x: sourceMid.x,
        y: source.y
      };
    } else if (orientation.includes('top')) {
      incomingInformationRequirements = incomingInformationRequirements.sort((a, b) => {
        return getMid(a.source).x - getMid(b.source).x;
      });

      dockingPoints = incomingInformationRequirements.map((_, index) => {
        return {
          x: target.x + target.width / (incomingInformationRequirements.length + 1) * (index + 1),
          y: target.y
        };
      });

      dockingPoint = {
        x: sourceMid.x,
        y: source.y + source.height
      };
    } else if (orientation.includes('right')) {
      incomingInformationRequirements = incomingInformationRequirements.sort((a, b) => {
        return getMid(a.source).y - getMid(b.source).y;
      });

      dockingPoints = incomingInformationRequirements.map((_, index) => {
        return {
          x: target.x + target.width,
          y: target.y + target.height / (incomingInformationRequirements.length + 1) * (index + 1)
        };
      });

      dockingPoint = {
        x: source.x,
        y: sourceMid.y
      };
    } else {
      incomingInformationRequirements = incomingInformationRequirements.sort((a, b) => {
        return getMid(a.source).y - getMid(b.source).y;
      });

      dockingPoints = incomingInformationRequirements.map((_, index) => {
        return {
          x: target.x,
          y: target.y + target.height / (incomingInformationRequirements.length + 1) * (index + 1)
        };
      });

      dockingPoint = {
        x: source.x + source.width,
        y: sourceMid.y
      };
    }

    modeling.reconnectStart(connection, connection.source, dockingPoint);

    incomingInformationRequirements.forEach((informationRequirement, index) => {
      var dockingPoint = dockingPoints[ index ];

      modeling.reconnectEnd(informationRequirement, target, dockingPoint);
    });
  }

  this.postExecuted([
    'connection.create',
    // 'connection.layout'
  ], cropConnection, true);

  this.reverted([ 'connection.layout' ], function(context) {
    delete context.cropped;
  }, true);

  function updateParent(context) {
    var connection = context.connection,
        parent = context.parent,
        shape = context.shape;

    if (connection && !is(connection, 'dmn:Association')) {
      parent = connection.target;
    }

    self.updateParent(shape || connection, parent);
  }

  function reverseUpdateParent(context) {
    var connection = context.connection,
        shape = context.shape;

    var oldParent = context.parent || context.newParent;

    if (connection && !is(connection, 'dmn:Association')) {
      oldParent = connection.target;
    }

    self.updateParent(shape || connection, oldParent);
  }

  this.executed([
    'connection.create',
    'connection.delete',
    'connection.move',
    'shape.create',
    'shape.delete'
  ], updateParent, true);

  this.reverted([
    'connection.create',
    'connection.delete',
    'connection.move',
    'shape.create',
    'shape.delete'
  ], reverseUpdateParent, true);

  function updateBounds(context) {
    var shape = context.shape;

    if (!(is(shape, 'dmn:DRGElement') || is(shape, 'dmn:TextAnnotation'))) {
      return;
    }

    self.updateBounds(shape);
  }

  this.executed([ 'shape.create', 'shape.move' ], updateBounds, true);

  this.reverted([ 'shape.create', 'shape.move' ], updateBounds, true);

  function updateConnectionWaypoints(context) {
    self.updateConnectionWaypoints(context);
  }

  this.executed([
    'connection.create',
    'connection.layout',
    'connection.move',
    'connection.updateWaypoints'
  ], updateConnectionWaypoints, true);

  this.reverted([
    'connection.create',
    'connection.layout',
    'connection.move',
    'connection.updateWaypoints'
  ], updateConnectionWaypoints, true);

  this.executed('connection.create', function(context) {
    var connection = context.connection,
        connectionBo = connection.businessObject,
        di = connectionBo.di,
        target = context.target,
        targetBo = target.businessObject;

    if (is(connection, 'dmn:Association')) {
      updateParent(context);
    } else {

      // parent is target
      self.updateSemanticParent(connectionBo, targetBo);

      // fix DI waypoints after connection cropping
      forEach(di.waypoint, function(waypoint, index) {
        waypoint.x = connection.waypoints[ index ].x;
        waypoint.y = connection.waypoints[ index ].y;
      });
    }
  }, true);

  this.reverted('connection.create', function(context) {
    reverseUpdateParent(context);
  }, true);

  this.executed('connection.reconnect', function(context) {
    var connection = context.connection,
        connectionBo = connection.businessObject,
        newTarget = context.newTarget,
        newTargetBo = newTarget.businessObject;

    self.updateSemanticParent(connectionBo, newTargetBo);
  }, true);

  this.reverted('connection.reconnect', function(context) {
    var connection = context.connection,
        connectionBo = connection.businessObject,
        oldTarget = context.oldTarget,
        oldTargetBo = oldTarget.businessObject;

    self.updateSemanticParent(connectionBo, oldTargetBo);
  }, true);

  this.executed('element.updateProperties', function(context) {
    definitionPropertiesView.update();
  }, true);

  this.reverted('element.updateProperties', function(context) {
    definitionPropertiesView.update();
  }, true);

}

inherits(DrdUpdater, CommandInterceptor);

DrdUpdater.$inject = [
  'connectionDocking',
  'definitionPropertiesView',
  'drdFactory',
  'drdRules',
  'injector'
];

DrdUpdater.prototype.updateBounds = function(shape) {
  var businessObject = shape.businessObject,
      bounds = businessObject.di.bounds;

  // update bounds
  assign(bounds, {
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height
  });
};

DrdUpdater.prototype.updateConnectionWaypoints = function(context) {
  var drdFactory = this._drdFactory;

  var connection = context.connection,
      businessObject = connection.businessObject,
      edge = businessObject.di;

  edge.waypoint = drdFactory.createDiWaypoints(connection.waypoints)
    .map(function(waypoint) {
      waypoint.$parent = edge;

      return waypoint;
    });
};

DrdUpdater.prototype.updateParent = function(element, oldParent) {
  var parent = element.parent;

  if (!is(element, 'dmn:DRGElement') && !is(element, 'dmn:Artifact')) {
    parent = oldParent;
  }

  var businessObject = element.businessObject,
      parentBo = parent && parent.businessObject;

  this.updateSemanticParent(businessObject, parentBo);

  this.updateDiParent(businessObject.di, parentBo && parentBo.di);
};

DrdUpdater.prototype.updateSemanticParent = function(businessObject, parent) {
  var children,
      containment;

  if (businessObject.$parent === parent) {
    return;
  }

  if (is(businessObject, 'dmn:DRGElement')) {
    containment = 'drgElement';
  } else if (is(businessObject, 'dmn:Artifact')) {
    containment = 'artifact';
  } else if (is(businessObject, 'dmn:InformationRequirement')) {
    containment = 'informationRequirement';
  } else if (is(businessObject, 'dmn:AuthorityRequirement')) {
    containment = 'authorityRequirement';
  } else if (is(businessObject, 'dmn:KnowledgeRequirement')) {
    containment = 'knowledgeRequirement';
  }

  if (businessObject.$parent) {

    // remove from old parent
    children = businessObject.$parent.get(containment);

    collectionRemove(children, businessObject);
  }

  if (parent) {

    // add to new parent
    children = parent.get(containment);

    if (children) {
      children.push(businessObject);

      businessObject.$parent = parent;
    }
  } else {
    businessObject.$parent = null;
  }
};

DrdUpdater.prototype.updateDiParent = function(di, parentDi) {

  if (di.$parent === parentDi) {
    return;
  }

  if (isAny(di, [ 'dmndi:DMNEdge', 'dmndi:DMNShape' ])) {

    var diagram = parentDi || di;
    while (!is(diagram, 'dmndi:DMNDiagram')) {
      diagram = diagram.$parent;
    }

    var diagramElements = diagram.get('diagramElements');
    if (parentDi) {
      di.$parent = diagram;

      collectionAdd(diagramElements, di);
    } else {
      di.$parent = null;

      collectionRemove(diagramElements, di);
    }
  } else {
    throw new Error('unsupported');
  }
};
