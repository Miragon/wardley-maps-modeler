/**
 * JSON-Bruecke. Das kanonische JSON-Format selbst lebt in @wardley/schema-model;
 * hier nur sprechende Re-Exports, damit Konsumenten alle (De-)Serialisierer aus @wardley/dsl
 * beziehen koennen.
 */
export {
  serializeMap as mapToJSON,
  parseMapJSON as mapFromJSON,
  loadMap,
} from '@wardley/schema-model';
