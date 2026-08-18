import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ThemeProvider } from '@/context/ThemeContext';
import { WorkspaceProvider } from '@/context/WorkspaceContext';

describe('ThemeToggle Component React JSDOM Test', () => {
  it('renders theme selector toggle button and opens dropdown options on click', () => {
    render(
      <WorkspaceProvider>
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      </WorkspaceProvider>
    );

    const button = screen.getByRole('button', { name: /select theme mode/i });
    expect(button).toBeInTheDocument();

    // Click to open dropdown
    fireEvent.click(button);

    // Verify option labels are visible in dropdown
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getAllByText('Dark').length).toBeGreaterThan(0);
    expect(screen.getByText('System')).toBeInTheDocument();
  });
});
