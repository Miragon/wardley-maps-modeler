import type { ModuleDeclaration } from 'didi';
import { WardleyBaseViewer } from './WardleyBaseViewer.js';
import { wardleyModelModule } from './model/index.js';
import { evolutionGridModule } from './evolution-grid/index.js';
import { wardleyDrawModule } from './draw/index.js';
import { ioModule } from './io/index.js';

export class Viewer extends WardleyBaseViewer {
  protected _getModules(): ModuleDeclaration[] {
    return [wardleyModelModule, evolutionGridModule, wardleyDrawModule, ioModule];
  }
}
