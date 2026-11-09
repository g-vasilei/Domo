import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { ReactNode } from 'react';

interface Item {
  id: string;
  label: string;
  content: ReactNode;
}

function DashboardItem({
  item,
  editing,
  disabled,
}: {
  item: Item;
  editing: boolean;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !editing || disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex min-w-0 flex-col ${isDragging ? 'relative z-20 opacity-60' : ''}`}
    >
      {editing && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Μετακίνηση: ${item.label}`}
          disabled={disabled}
          className="mb-2 flex touch-none items-center gap-1.5 self-end rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 hover:border-brand hover:text-brand focus-visible:outline-brand disabled:opacity-40 dark:border-white/10 dark:bg-[#1A222C] dark:text-slate-400 cursor-grab active:cursor-grabbing"
        >
          <GripVertical size={14} />
          {item.label}
        </button>
      )}
      {item.content}
    </div>
  );
}

export default function DashboardLayout({
  items,
  order,
  onReorder,
  editing,
  disabled,
  className,
  hiddenIds = [],
}: {
  items: Item[];
  order: string[];
  onReorder: (order: string[]) => void;
  editing: boolean;
  disabled: boolean;
  className: string;
  hiddenIds?: string[];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ordered = [...new Set(order)]
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is Item => !!item);
  for (const item of items) if (!ordered.some((entry) => entry.id === item.id)) ordered.push(item);
  const ids = ordered.map((item) => item.id);
  const visibleItems = ordered.filter(
    (item) => !hiddenIds.includes(item.id) && item.content != null,
  );
  const visibleIds = visibleItems.map((item) => item.id);
  if (!visibleItems.length) return null;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!editing || disabled || !over || active.id === over.id) return;
        if (!visibleIds.includes(String(active.id)) || !visibleIds.includes(String(over.id)))
          return;
        const from = ids.indexOf(String(active.id));
        const to = ids.indexOf(String(over.id));
        if (from >= 0 && to >= 0) onReorder(arrayMove(ids, from, to));
      }}
    >
      <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
        <div className={className}>
          {visibleItems.map((item) => (
            <DashboardItem key={item.id} item={item} editing={editing} disabled={disabled} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
