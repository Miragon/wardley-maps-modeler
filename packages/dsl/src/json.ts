/**
 * JSON bridge. The canonical JSON format itself lives in @wardley/schema-model;
 * these are just descriptive re-exports so consumers can obtain all (de)serializers from
 * @wardley/dsl.
 */
export {
  serializeMap as mapToJSON,
  parseMapJSON as mapFromJSON,
  loadMap,
} from '@wardley/schema-model';
