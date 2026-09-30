import { Plus } from 'lucide-react'

export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="fab" aria-label={label} title={label} onClick={onClick}>
      <Plus size={28} strokeWidth={2.4} />
    </button>
  )
}
