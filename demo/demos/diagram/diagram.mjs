// diagram demo bootstrap — node-only scene with marquee multi-select.
//
// Every data class lives in the framework now: DiagramDocument owns
// the Nodes / ToolboxShapes / Status / Save+Load + the structural
// mutation methods, Figure / Group are the canvas items themselves
// (visuals + data fused), and ToolboxShape is the toolbox-tile
// model. The demo just creates a Document, plugs in localStorage,
// seeds a few Figures, and returns it for the platform to mount.

import { Application } from '@visualisation-sub/mural/runtime';
import { ConnectorEndpoint, DiagramDocument } from '@visualisation-sub/mural/framework';
import { DiagramDemo } from './diagram.mu.js';
import { register } from '../../platform/registry.mjs';
import Icons from '../../assets/icons.mjs';

const LocalStorageService = {
    GetItem(key)        { return window.localStorage.getItem(key); },
    SetItem(key, value) { window.localStorage.setItem(key, value); },
};

let resourcesMerged = false;
let docInstance;

register({
    id:       'diagram',
    group:    'Demos',
    title:    'Diagrammer',
    subtitle: 'Drag shapes from the toolbox; drag a node to move; click / marquee to select; Delete to remove.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(DiagramDemo.Clone());
            Application.current?.Resources.AddMergedDictionary(Icons);
            resourcesMerged = true;
        }
        if (docInstance === undefined) {
            docInstance = new DiagramDocument(LocalStorageService);
            // Seed a few nodes so the demo doesn't open empty.
            const rect    = docInstance.CreateNode('rectangle',     60,  60);
            const ellipse = docInstance.CreateNode('ellipse',      220,  60);
            const squir   = docInstance.CreateNode('squircle',      60, 200);
            const flower  = docInstance.CreateNode('flower',       220, 200);
            docInstance.CreateNode('heart',        380,  60);
            // Seed two connectors so users see something on first open:
            // rectangle → ellipse (anchored, framework auto-picks ports);
            // squircle → flower   (anchored, framework auto-picks ports).
            docInstance.CreateConnector(
                new ConnectorEndpoint({ Node: rect }),
                new ConnectorEndpoint({ Node: ellipse }));
            docInstance.CreateConnector(
                new ConnectorEndpoint({ Node: squir }),
                new ConnectorEndpoint({ Node: flower }));
            docInstance.Status = `Ready. ${docInstance.Nodes.Count} nodes, ${docInstance.Connectors.Count} connectors. Drag a shape from the toolbox →`;
        }
        return docInstance;
    },
});
