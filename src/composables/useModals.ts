import { reactive } from "vue";
import type { EntryData } from "../types";

// Shared modal state so any component can open the confirm/XML dialogs.
interface DeleteModalState {
  visible: boolean;
  entry: EntryData | null;
  permanent: boolean;
}

interface XmlModalState {
  visible: boolean;
  content: string;
}

export const deleteModal = reactive<DeleteModalState>({
  visible: false,
  entry: null,
  permanent: false,
});

export const xmlModal = reactive<XmlModalState>({
  visible: false,
  content: "",
});

export function openDeleteModal(entry: EntryData, permanent: boolean): void {
  deleteModal.entry = entry;
  deleteModal.permanent = permanent;
  deleteModal.visible = true;
}

export function closeDeleteModal(): void {
  deleteModal.visible = false;
  deleteModal.entry = null;
}

export function openXmlModal(content: string): void {
  xmlModal.content = content;
  xmlModal.visible = true;
}

export function closeXmlModal(): void {
  xmlModal.visible = false;
}
