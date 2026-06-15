import { createStore } from "../lib/store";
import type { EntryData } from "../types";

interface ModalState {
  deleteVisible: boolean;
  deleteEntry: EntryData | null;
  deletePermanent: boolean;
  xmlVisible: boolean;
  xmlContent: string;
}

export const modalStore = createStore<ModalState>({
  deleteVisible: false,
  deleteEntry: null,
  deletePermanent: false,
  xmlVisible: false,
  xmlContent: "",
});

export const useModals = modalStore.use;

export function openDeleteModal(entry: EntryData, permanent: boolean): void {
  modalStore.setState({
    deleteEntry: entry,
    deletePermanent: permanent,
    deleteVisible: true,
  });
}

export function closeDeleteModal(): void {
  modalStore.setState({ deleteVisible: false, deleteEntry: null });
}

export function openXmlModal(content: string): void {
  modalStore.setState({ xmlContent: content, xmlVisible: true });
}

export function closeXmlModal(): void {
  modalStore.setState({ xmlVisible: false });
}
