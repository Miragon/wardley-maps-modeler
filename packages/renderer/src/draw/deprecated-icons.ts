/*
 * The Material icons (Apache-2.0, © Google) the renderer offered for a host's buttons and menus.
 * The chrome's icons come from @miragon/modeler-shell (Lucide, guide §5.14) since both apps wear
 * it; these exports stay until a later minor so a consumer's own buttons keep working. The canvas
 * keeps its icons in icons.ts.
 */
import {
  ICON_DELETE as deleteIcon,
  ICON_EDIT as editIcon,
  ICON_PERSON as personIcon,
  iconMarkup as materialIconMarkup,
} from './icons.js';

/** @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_UNDO =
  'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z';

/** @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_REDO =
  'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z';

/** data_object — JSON. @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_DATA_OBJECT =
  'M4 7v2c0 .55-.45 1-1 1H2v2h1c.55 0 1 .45 1 1v2c0 1.65 1.35 3 3 3h1v-2H7c-.55 0-1-.45-1-1v-2c0-.84-.35-1.61-.92-2.18L4.85 12l.23-.82C5.65 10.61 6 9.84 6 9V7c0-.55.45-1 1-1h1V4H7C5.35 4 4 5.35 4 7zm16 3c-.55 0-1-.45-1-1V7c0-1.65-1.35-3-3-3h-1v2h1c.55 0 1 .45 1 1v2c0 .84.35 1.61.92 2.18l.23.82-.23.82c-.57.57-.92 1.34-.92 2.18v2c0 .55-.45 1-1 1h-1v2h1c1.65 0 3-1.35 3-3v-2c0-.55.45-1 1-1h1v-2h-1z';

/** code — DSL. @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_CODE =
  'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z';

/** download — Export. @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_DOWNLOAD = 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z';

/** share — share link. @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_SHARE =
  'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z';

/** folder_open — open file. @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_FOLDER_OPEN =
  'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z';

/** image — PNG/image. @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_IMAGE =
  'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z';

/** note_add — new / clear. @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_NEW =
  'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 14h-3v3h-2v-3H8v-2h3v-3h2v3h3v2zm-3-7V3.5L18.5 9H13z';

/** aspect_ratio — map size. @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_ASPECT_RATIO =
  'M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z';

/** menu — hamburger (main menu). @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_MENU = 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z';

/** add — append component. @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_ADD = 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z';

/** visibility — eye (show example). @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_VISIBILITY =
  'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z';

/** @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_PERSON: string = personIcon;

/** @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_EDIT: string = editIcon;

/** @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export const ICON_DELETE: string = deleteIcon;

/** Returns an icon as an HTML SVG string, colour = currentColor. @deprecated Chrome icons come from @miragon/modeler-shell (Lucide, guide §5.14); this export goes in a later minor. */
export function iconMarkup(path: string, size?: number): string {
  return materialIconMarkup(path, size);
}
