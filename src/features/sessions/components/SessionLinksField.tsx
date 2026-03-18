import type { SessionLink } from '../../../types';

interface SessionLinksFieldProps {
  links: SessionLink[];
  onChange: (links: SessionLink[]) => void;
}

export function SessionLinksField({ links, onChange }: SessionLinksFieldProps) {
  function updateLink(index: number, key: keyof SessionLink, value: string) {
    const updatedLinks = links.map((link, currentIndex) =>
      currentIndex === index ? { ...link, [key]: value } : link
    );
    onChange(updatedLinks);
  }

  function addLink() {
    onChange([...links, { label: '', url: '' }]);
  }

  function removeLink(index: number) {
    onChange(links.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <div className="session-field session-field-full">
      <div className="session-links-header">
        <label className="session-label">Links</label>
        <button type="button" className="btn-secondary" onClick={addLink}>
          Add Link
        </button>
      </div>

      {links.length === 0 ? <p className="muted">No links added.</p> : null}

      <div className="session-links-list">
        {links.map((link, index) => (
          <div key={`session-link-${index}`} className="session-link-row">
            <input
              className="session-input"
              placeholder="Label"
              value={link.label}
              onChange={(event) => updateLink(index, 'label', event.target.value)}
            />
            <input
              className="session-input"
              placeholder="https://example.com"
              value={link.url}
              onChange={(event) => updateLink(index, 'url', event.target.value)}
            />
            <button type="button" className="btn-danger" onClick={() => removeLink(index)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
