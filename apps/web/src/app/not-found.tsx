import Link from 'next/link';
import { ZipSearchForm } from '@/components/ZipSearchForm';

export default function NotFound() {
  return (
    <div className="section" style={{ maxWidth: '34rem' }}>
      <h1>Not found</h1>
      <p className="muted">
        There is nothing at this address. If you were looking for a retailer, it may not be in the licensed
        directory, or its page may have moved.
      </p>
      <div className="section">
        <ZipSearchForm />
      </div>
      <p className="small faint">
        A retailer missing that should be here? <Link href="/corrections">Tell us</Link>.
      </p>
    </div>
  );
}
