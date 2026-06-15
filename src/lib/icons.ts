import type { LucideIcon } from "lucide-react";
import {
  Key,
  Globe,
  TriangleAlert,
  Server,
  Pin,
  MessagesSquare,
  Puzzle,
  SquarePen,
  Plug,
  IdCard,
  Paperclip,
  Camera,
  Wifi,
  Link,
  BatteryMedium,
  Barcode,
  Award,
  Target,
  Monitor,
  Mail,
  Settings,
  Clipboard,
  Send,
  Newspaper,
  Zap,
  Inbox,
  Save,
  HardDrive,
  CircleDot,
  UserLock,
  Terminal,
  Printer,
  Workflow,
  Flag,
  Wrench,
  Laptop,
  Archive,
  CreditCard,
  AppWindow,
  Clock,
  Search,
  FlaskConical,
  Gamepad2,
  Trash2,
  StickyNote,
  Ban,
  CircleHelp,
  Box,
  Folder,
  FolderOpen,
  Database,
  Unlock,
  Lock,
  Check,
  Pencil,
  Image,
  Book,
  LayoutList,
  VenetianMask,
  Utensils,
  House,
  Star,
  Bird,
  MapPin,
  Apple,
  Library,
  DollarSign,
  Signature,
  Smartphone,
} from "lucide-react";
import type { EntryData } from "../types";

// KDBX built-in icons (indices 0-68), mapped to Lucide icons. Index = the KDBX
// IconID, in KeeWeb's icon-map.js order (the FontAwesome name is noted for each).
// 4 entries are brand logos Lucide doesn't ship; the closest generic icon is
// used and marked APPROX.
export const ICON_COMPONENTS: LucideIcon[] = [
  Key, //            0  key
  Globe, //          1  globe
  TriangleAlert, //  2  exclamation-triangle
  Server, //         3  server
  Pin, //            4  thumbtack
  MessagesSquare, // 5  comments
  Puzzle, //         6  puzzle-piece
  SquarePen, //      7  edit
  Plug, //           8  plug
  IdCard, //         9  address-card
  Paperclip, //      10 paperclip
  Camera, //         11 camera
  Wifi, //           12 wifi
  Link, //           13 link
  BatteryMedium, //  14 battery-three-quarters
  Barcode, //        15 barcode
  Award, //          16 certificate
  Target, //         17 bullseye
  Monitor, //        18 desktop
  Mail, //           19 envelope
  Settings, //       20 cog
  Clipboard, //      21 clipboard
  Send, //           22 paper-plane
  Newspaper, //      23 newspaper
  Zap, //            24 bolt
  Inbox, //          25 inbox
  Save, //           26 save
  HardDrive, //      27 hdd
  CircleDot, //      28 dot-circle
  UserLock, //       29 user-lock
  Terminal, //       30 terminal
  Printer, //        31 print
  Workflow, //       32 project-diagram
  Flag, //           33 flag-checkered  (APPROX: no checkered variant)
  Wrench, //         34 wrench
  Laptop, //         35 laptop
  Archive, //        36 archive
  CreditCard, //     37 credit-card
  AppWindow, //      38 windows  (APPROX: no Microsoft brand logo)
  Clock, //          39 clock
  Search, //         40 search
  FlaskConical, //   41 flask
  Gamepad2, //       42 gamepad
  Trash2, //         43 trash
  StickyNote, //     44 sticky-note
  Ban, //            45 ban
  CircleHelp, //     46 question-circle
  Box, //            47 cube
  Folder, //         48 folder-o
  FolderOpen, //     49 folder-open-o
  Database, //       50 database
  Unlock, //         51 unlock-alt
  Lock, //           52 lock
  Check, //          53 check
  Pencil, //         54 pencil-alt
  Image, //          55 image
  Book, //           56 book
  LayoutList, //     57 list-alt
  VenetianMask, //   58 user-secret  (APPROX: spy → mask)
  Utensils, //       59 utensils
  House, //          60 home
  Star, //           61 star
  Bird, //           62 linux  (APPROX: no penguin / Linux brand)
  MapPin, //         63 map-pin
  Apple, //          64 apple  (APPROX: fruit, not the Apple brand logo)
  Library, //        65 wikipedia-w  (APPROX: no Wikipedia brand)
  DollarSign, //     66 dollar-sign
  Signature, //      67 signature
  Smartphone, //     68 mobile
];

export function iconComponent(id: number): LucideIcon {
  return ICON_COMPONENTS[id] || ICON_COMPONENTS[0];
}

export function hasCustomIcon(e: Pick<EntryData, "custom_icon_base64">): boolean {
  return !!e.custom_icon_base64;
}
