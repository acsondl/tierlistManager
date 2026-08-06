import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom'; // <-- 1. Import Router Hooks
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
import '../index.css'; // <-- 2. Fixed Path for the pages folder!

const TIERS = [
  { id: 's', label: 'S', color: 'bg-red-500' },
  { id: 'a', label: 'A', color: 'bg-orange-500' },
  { id: 'b', label: 'B', color: 'bg-yellow-500' },
  { id: 'c', label: 'C', color: 'bg-green-500' },
  { id: 'd', label: 'D', color: 'bg-blue-500' },
];

function SortableItem({ id, label }: { id: string, label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="w-20 h-20 md:w-28 md:h-28 touch-none bg-gray-600 rounded flex items-center justify-center font-bold text-xs md:text-xl text-center p-1 md:p-2 shadow-md cursor-grab active:cursor-grabbing hover:bg-gray-500 z-50 relative break-words overflow-hidden leading-tight">
      {label}
    </div>
  );
}

function SortableZone({ id, items, className }: { id: string, items: any[], className: string }) {
  const { setNodeRef } = useDroppable({ id }); 
  return (
    <SortableContext id={id} items={items.map(i => i.id)} strategy={rectSortingStrategy}>
      <div ref={setNodeRef} className={className}>
        {items.map(item => <SortableItem key={item.id} id={item.id} label={item.label} />)}
      </div>
    </SortableContext>
  );
}

export default function Editor() {
  const { id: listId } = useParams(); // <-- 3. Extracts the '1' from '/editor/1'
  
  // REPLACE THIS WITH YOUR ACTUAL TAILSCALE IP
  const BACKEND_URL = "https://linux.tail2f8d37.ts.net:8444/api/items";

  const [items, setItems] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } }) 
  );

  useEffect(() => {
    // 4. Ask Go for items belonging to THIS specific list
    fetch(`${BACKEND_URL}?list_id=${listId}`)
      .then(response => response.json())
      .then(data => {
        if (data && data.length > 0) {
          setItems(data);
        } else {
          setItems([]); // Clear the board if this is a brand new empty list
        }
      })
      .catch(error => console.error("Error fetching data:", error));
  }, [listId]);

  const saveToDatabase = (newItems: any[]) => {
    fetch(BACKEND_URL + "/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newItems)
    }).catch(error => console.error("Error saving data:", error));
  };

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault(); 
    if (inputValue.trim() === '') return; 

    const newItem = { 
      id: `item-${Date.now()}`, 
      label: inputValue.trim(), 
      tier: 'pool',
      tier_list_id: Number(listId) // <-- 5. Save the Foreign Key to Postgres!
    };
    
    const updatedItems = [...items, newItem];
    setItems(updatedItems);
    saveToDatabase(updatedItems); 
    setInputValue(''); 
  }

  function handleDragStart(event: any) { setActiveId(event.active.id); }

  function handleDragOver(event: any) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;
    if (activeId === overId) return;

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

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-gray-900 text-white p-2 md:p-8 font-sans">
        
        {/* NEW: Back to Menu Button */}
        <div className="max-w-5xl mx-auto mb-4">
          <Link to="/" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors flex items-center gap-2">
            ← Back to My Lists
          </Link>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-center mb-6 md:mb-10 text-gray-100">Tier List Maker</h1>
        
        <div className="max-w-5xl mx-auto flex flex-col gap-2 mb-12">
          {TIERS.map((tier) => (
            <div key={tier.id} className="flex bg-gray-800 border border-gray-700 min-h-[100px] md:min-h-[120px]">
              <div className={`${tier.color} w-16 md:w-24 shrink-0 flex items-center justify-center text-2xl md:text-4xl font-bold text-gray-900 border-r border-gray-900 shadow-inner`}>
                {tier.label}
              </div>
              <SortableZone id={tier.id} items={items.filter(item => item.tier === tier.id)} className="flex-1 p-2 md:p-4 flex flex-wrap content-start gap-2" />
            </div>
          ))}
        </div>
        
        <div className="max-w-5xl mx-auto px-2 md:px-0">
          <div className="mb-6 bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-xl">
            <h2 className="text-xl font-semibold mb-3 text-gray-300">Add New Item</h2>
            <form onSubmit={handleAddItem} className="flex gap-2 md:gap-3">
              <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="E.g., Cyberpunk 2077..." className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 md:px-4 md:py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors" />
              <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 md:py-3 md:px-8 rounded-lg shadow-md transition-colors">Add</button>
            </form>
          </div>
          <h2 className="text-2xl font-semibold mb-4 text-gray-300">Unranked Pool</h2>
          <SortableZone id="pool" items={items.filter(item => item.tier === 'pool')} className="bg-gray-800 border border-gray-700 min-h-[150px] p-2 md:p-4 flex flex-wrap content-start gap-2 md:gap-3 rounded-lg shadow-xl" />
        </div>
      </div>
      
      <DragOverlay>
        {activeId ? (
          <div className="w-20 h-20 md:w-28 md:h-28 touch-none bg-gray-500 rounded flex items-center justify-center font-bold text-xs md:text-xl text-center p-1 md:p-2 shadow-2xl opacity-90 scale-105 cursor-grabbing break-words overflow-hidden leading-tight">
            {items.find(i => i.id === activeId)?.label}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}