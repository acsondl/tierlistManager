import { useState } from 'react';
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
import './index.css';

const TIERS = [
  { id: 's', label: 'S', color: 'bg-red-500' },
  { id: 'a', label: 'A', color: 'bg-orange-500' },
  { id: 'b', label: 'B', color: 'bg-yellow-500' },
  { id: 'c', label: 'C', color: 'bg-green-500' },
  { id: 'd', label: 'D', color: 'bg-blue-500' },
];

function SortableItem({ id, label }: { id: string, label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  
  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...listeners} 
      {...attributes} 
      // FIXED: Added "touch-none" here so the iPhone won't scroll when dragging
      className="w-28 h-28 touch-none bg-gray-600 rounded flex items-center justify-center font-bold text-xl text-center p-2 shadow-md cursor-grab active:cursor-grabbing hover:bg-gray-500 z-50 relative"
    >
      {label}
    </div>
  );
}

function SortableZone({ id, items, className }: { id: string, items: any[], className: string }) {
  const { setNodeRef } = useDroppable({ id }); 

  return (
    <SortableContext id={id} items={items.map(i => i.id)} strategy={rectSortingStrategy}>
      <div ref={setNodeRef} className={className}>
        {items.map(item => (
          <SortableItem key={item.id} id={item.id} label={item.label} />
        ))}
      </div>
    </SortableContext>
  );
}

function App() {
  const [items, setItems] = useState([
    { id: 'item-1', label: 'Item 1', tier: 'pool' },
    { id: 'item-2', label: 'Item 2', tier: 'pool' },
    { id: 'item-3', label: 'Item 3', tier: 'pool' },
  ]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } }) 
  );

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault(); 
    
    if (inputValue.trim() === '') return; 

    const newItem = {
      id: `item-${Date.now()}`, 
      label: inputValue.trim(),
      tier: 'pool'
    };

    setItems((prevItems) => [...prevItems, newItem]);
    setInputValue(''); 
  }

  function handleDragStart(event: any) {
    setActiveId(event.active.id);
  }

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

      // FIXED: When moving to a container's empty space, force it to the end of the array
      if (isOverContainer) {
        if (activeItem.tier === overId) return prevItems; // Already there, do nothing

        const updatedItems = [...prevItems];
        updatedItems[activeIndex] = { ...activeItem, tier: String(overId) };
        // Physically move the item to the very back of the array so it drops on the far right
        return arrayMove(updatedItems, activeIndex, updatedItems.length - 1);
      }

      // If hovering over another specific item in a different tier
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

    // FIXED: Only trigger standard sorting if we drop directly on top of another item
    if (overIndex !== -1 && activeIndex !== overIndex) {
      setItems((items) => arrayMove(items, activeIndex, overIndex));
    }
  }

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={pointerWithin} 
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
        <h1 className="text-4xl font-bold text-center mb-10 text-gray-100">
          Tier List Maker
        </h1>

        <div className="max-w-5xl mx-auto flex flex-col gap-2 mb-12">
          {TIERS.map((tier) => (
            <div key={tier.id} className="flex bg-gray-800 border border-gray-700 min-h-[120px]">
              <div className={`${tier.color} w-24 flex items-center justify-center text-4xl font-bold text-gray-900 border-r border-gray-900 shadow-inner`}>
                {tier.label}
              </div>
              
              <SortableZone 
                id={tier.id} 
                items={items.filter(item => item.tier === tier.id)} 
                className="flex-1 p-4 flex flex-wrap content-start gap-2" 
              />
            </div>
          ))}
        </div>

        <div className="max-w-5xl mx-auto">
          
          <div className="mb-6 bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-xl">
            <h2 className="text-xl font-semibold mb-3 text-gray-300">Add New Item</h2>
            <form onSubmit={handleAddItem} className="flex gap-3">
              <input 
                type="text" 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="E.g., Cyberpunk 2077..."
                className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              <button 
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-colors"
              >
                Add
              </button>
            </form>
          </div>

          <h2 className="text-2xl font-semibold mb-4 text-gray-300">Unranked Pool</h2>
          <SortableZone 
            id="pool" 
            items={items.filter(item => item.tier === 'pool')} 
            className="bg-gray-800 border border-gray-700 min-h-[150px] p-4 flex flex-wrap content-start gap-3 rounded-lg shadow-xl" 
          />
        </div>
      </div>

      <DragOverlay>
        {activeId ? (
          <div className="w-28 h-28 touch-none bg-gray-500 rounded flex items-center justify-center text-center p-2 font-bold text-xl shadow-2xl opacity-90 scale-105 cursor-grabbing">
            {items.find(i => i.id === activeId)?.label}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

export default App