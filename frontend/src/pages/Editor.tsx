import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  DndContext, 
  pointerWithin, 
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  TouchSensor,
  useDroppable
} from '@dnd-kit/core';
import { 
  SortableContext, 
  rectSortingStrategy, 
  useSortable, 
  arrayMove 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import '../index.css';

const TIERS = [
  { id: 's', label: 'S', color: 'bg-red-500' },
  { id: 'a', label: 'A', color: 'bg-orange-500' },
  { id: 'b', label: 'B', color: 'bg-yellow-500' },
  { id: 'c', label: 'C', color: 'bg-green-500' },
  { id: 'd', label: 'D', color: 'bg-blue-500' },
];

function SortableItem({ id, label, image }: { id: string, label: string, image?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="w-16 h-16 md:w-20 md:h-20 touch-none bg-gray-700 flex items-center justify-center text-center font-bold text-xs md:text-sm shadow-sm cursor-grab active:cursor-grabbing hover:opacity-80 z-50 relative overflow-hidden shrink-0">
      {image ? <img src={image} alt={label} className="w-full h-full object-cover pointer-events-none" /> : <span className="p-1 break-words">{label}</span>}
    </div>
  );
}

function SortableZone({ id, items, className }: { id: string, items: any[], className: string }) {
  const { setNodeRef } = useDroppable({ id }); 
  return (
    <SortableContext id={id} items={items.map(i => i.id)} strategy={rectSortingStrategy}>
      <div ref={setNodeRef} className={className}>
        {items.map(item => <SortableItem key={item.id} id={item.id} label={item.label} image={item.image} />)}
      </div>
    </SortableContext>
  );
}

// NEW COMPONENT: The Trash Can
function TrashZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash' });
  return (
    <div 
      ref={setNodeRef} 
      className={`w-full p-4 rounded-lg border-2 border-dashed flex items-center justify-center font-bold text-xl transition-colors duration-200 mt-4 ${
        isOver ? 'bg-red-900 border-red-500 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-gray-900 border-gray-700 text-gray-500'
      }`}
    >
      🗑️ Drag Here to Delete
    </div>
  );
}

export default function Editor() {
  const { id: listId } = useParams(); 
  const BACKEND_URL = "https://linux.tail2f8d37.ts.net:8444/api/items";

  const [items, setItems] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } }) 
  );

  useEffect(() => {
    fetch(`${BACKEND_URL}?list_id=${listId}`)
      .then(response => response.json())
      .then(data => { if (data && data.length > 0) setItems(data); else setItems([]); })
      .catch(error => console.error("Error fetching data:", error));
  }, [listId]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.indexOf('image') !== -1) {
          const file = clipboardItems[i].getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64String = reader.result as string;
            const newItem = { id: `item-${Date.now()}`, label: 'Pasted Image', image: base64String, tier: 'pool', tier_list_id: Number(listId) };
            setItems((prev) => {
              const updated = [...prev, newItem];
              saveToDatabase(updated);
              return updated;
            });
          };
          reader.readAsDataURL(file);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [listId]);

  const saveToDatabase = (newItems: any[]) => {
    fetch(BACKEND_URL + "/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newItems)
    }).catch(error => console.error("Error saving data:", error));
  };

  function handleAddText(e: React.FormEvent) {
    e.preventDefault(); 
    if (inputValue.trim() === '') return; 
    const newItem = { id: `item-${Date.now()}`, label: inputValue.trim(), tier: 'pool', tier_list_id: Number(listId) };
    setItems((prev) => {
      const updated = [...prev, newItem];
      saveToDatabase(updated);
      return updated;
    });
    setInputValue(''); 
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string; 
      const newItem = { id: `item-${Date.now()}`, label: file.name, image: base64String, tier: 'pool', tier_list_id: Number(listId) };
      setItems((prev) => {
        const updated = [...prev, newItem];
        saveToDatabase(updated);
        return updated;
      });
    };
    reader.readAsDataURL(file);
  }

  function handleDragStart(event: any) { setActiveId(event.active.id); }

  function handleDragOver(event: any) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;
    if (activeId === overId) return;

    // Do nothing to the sorting array while hovering over the Trash zone
    if (overId === 'trash') return;

    setItems((prevItems) => {
      const activeIndex = prevItems.findIndex(item => item.id === activeId);
      const overIndex = prevItems.findIndex(item => item.id === overId);
      const activeItem = prevItems[activeIndex];
      const overItem = prevItems[overIndex];

      if (!activeItem) return prevItems;
      const isOverContainer = TIERS.some(t => t.id === overId) || overId === 'pool';

      if (isOverContainer) {
        if (activeItem.tier === overId) return prevItems; 
        const updatedItems = [...prevItems];
        updatedItems[activeIndex] = { ...activeItem, tier: String(overId) };
        return arrayMove(updatedItems, activeIndex, updatedItems.length - 1);
      }

      if (overItem && activeItem.tier !== overItem.tier) {
        const updatedItems = [...prevItems];
        updatedItems[activeIndex] = { ...activeItem, tier: overItem.tier };
        return arrayMove(updatedItems, activeIndex, overIndex);
      }
      return prevItems;
    });
  }

  function handleDragEnd(event: any) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    // NEW: Execute the Deletion if dropped in the Trash Zone
    if (over.id === 'trash') {
      setItems((prev) => {
        const updated = prev.filter(item => item.id !== active.id);
        
        // Tell the Go backend to delete it permanently
        fetch(`${BACKEND_URL}?id=${active.id}`, { method: 'DELETE' })
          .catch(err => console.error("Error deleting:", err));
          
        return updated;
      });
      return;
    }

    const activeIndex = items.findIndex(item => item.id === active.id);
    const overIndex = items.findIndex(item => item.id === over.id);

    if (overIndex !== -1 && activeIndex !== overIndex) {
      setItems((prevItems) => {
        const newlySortedItems = arrayMove(prevItems, activeIndex, overIndex);
        saveToDatabase(newlySortedItems); 
        return newlySortedItems;
      });
    } else {
      saveToDatabase(items);
    }
  }

  const activeItemData = items.find(i => i.id === activeId);

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-[#111111] text-white p-2 md:p-6 font-sans flex flex-col items-center">
        
        <div className="w-full max-w-4xl mb-4 self-start md:self-auto md:w-full">
          <Link to="/" className="text-gray-400 hover:text-gray-200 font-semibold transition-colors flex items-center gap-2">
            ← Back to Menu
          </Link>
        </div>
        
        <div className="w-full max-w-4xl flex flex-col border-2 border-black bg-[#1a1a1a] mb-12">
          {TIERS.map((tier) => (
            <div key={tier.id} className="flex border-b border-black min-h-[64px] md:min-h-[80px]">
              <div className={`${tier.color} w-20 md:w-24 shrink-0 flex items-center justify-center text-xl md:text-2xl font-bold text-black border-r border-black`}>
                {tier.label}
              </div>
              <SortableZone id={tier.id} items={items.filter(item => item.tier === tier.id)} className="flex-1 p-1 flex flex-wrap content-start gap-1" />
            </div>
          ))}
        </div>
        
        <div className="w-full max-w-4xl px-2 md:px-0">
          <div className="mb-6 bg-gray-800 p-4 rounded border border-gray-700 shadow-xl flex flex-col md:flex-row gap-4 justify-between items-center">
            <form onSubmit={handleAddText} className="flex gap-2 w-full md:w-auto">
              <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Type a label..." className="flex-1 md:w-64 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
              <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded shadow">Add Text</button>
            </form>
            <span className="text-gray-500 font-bold hidden md:block">OR</span>
            <label className="w-full md:w-auto bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded shadow cursor-pointer text-center">
              Upload Image
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>

          <SortableZone id="pool" items={items.filter(item => item.tier === 'pool')} className="bg-[#1a1a1a] border-2 border-black min-h-[150px] p-2 flex flex-wrap content-start gap-1 shadow-xl" />
          
          {/* THE NEW TRASH DROPZONE */}
          <TrashZone />
        </div>
      </div>
      
      <DragOverlay>
        {activeId ? (
          <div className="w-16 h-16 md:w-20 md:h-20 touch-none bg-gray-700 flex items-center justify-center text-center font-bold text-xs md:text-sm shadow-2xl opacity-90 scale-110 cursor-grabbing overflow-hidden">
            {activeItemData?.image ? <img src={activeItemData.image} alt="dragging" className="w-full h-full object-cover pointer-events-none" /> : <span className="p-1 break-words">{activeItemData?.label}</span>}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}