import { createStore } from "../lib/store";
import type { EntryData, GroupData } from "../types";

export type CreateKind = "entry" | "group";

interface ModalState {
  deleteVisible: boolean;
  deleteEntry: EntryData | null;
  deletePermanent: boolean;
  // Group deletion (separate from entry deletion).
  deleteGroupVisible: boolean;
  deleteGroup: GroupData | null;
  xmlVisible: boolean;
  xmlContent: string;
  createVisible: boolean;
  createKind: CreateKind;
  // When set, the create-entry dialog opens in edit mode for this entry.
  createEntry: EntryData | null;
  // When set, the group dialog opens in edit mode for this group.
  createGroup: GroupData | null;
}

export const modalStore = createStore<ModalState>({
  deleteVisible: false,
  deleteEntry: null,
  deletePermanent: false,
  deleteGroupVisible: false,
  deleteGroup: null,
  xmlVisible: false,
  xmlContent: "",
  createVisible: false,
  createKind: "entry",
  createEntry: null,
  createGroup: null,
});

export const useModals = modalStore.use;

export function openCreateModal(kind: CreateKind): void {
  modalStore.setState({
    createKind: kind,
    createEntry: null,
    createGroup: null,
    createVisible: true,
  });
}

// Open the entry dialog pre-filled to edit an existing entry.
export function openEditEntryModal(entry: EntryData): void {
  modalStore.setState({ createKind: "entry", createEntry: entry, createVisible: true });
}

// Open the group dialog pre-filled to edit an existing group.
export function openEditGroupModal(group: GroupData): void {
  modalStore.setState({ createKind: "group", createGroup: group, createVisible: true });
}

export function closeCreateModal(): void {
  modalStore.setState({ createVisible: false });
}

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

export function openDeleteGroupModal(group: GroupData): void {
  modalStore.setState({ deleteGroup: group, deleteGroupVisible: true });
}

export function closeDeleteGroupModal(): void {
  modalStore.setState({ deleteGroupVisible: false, deleteGroup: null });
}

export function openXmlModal(content: string): void {
  modalStore.setState({ xmlContent: content, xmlVisible: true });
}

export function closeXmlModal(): void {
  modalStore.setState({ xmlVisible: false });
}
