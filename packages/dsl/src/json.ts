/**
 * JSON bridge. The canonical JSON format itself lives in @miragon/wardley-schema-model;
 * these are just descriptive re-exports so consumers can obtain all (de)serializers from
 * @miragon/wardley-dsl.
 */
export {
  serializeMap as mapToJSON,
  parseMapJSON as mapFromJSON,
  loadMap,
} from '@miragon/wardley-schema-model';
