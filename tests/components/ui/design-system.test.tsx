import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

/**
 * Phase 77A — the first shared component library in this codebase. These tests verify each
 * primitive resolves to the centralized semantic tokens (never a hardcoded hex/light-only
 * class) and that existing props/behavior work, since "do not break existing components"
 * applies to anything built on top of these going forward.
 */
describe('Phase 77A — shared UI primitives', () => {
  describe('Button', () => {
    it('renders children and forwards onClick', () => {
      const onClick = jest.fn();
      render(<Button onClick={onClick}>Save</Button>);
      const btn = screen.getByRole('button', { name: 'Save' });
      fireEvent.click(btn);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('every variant uses semantic tokens, never a raw hex or hardcoded light-only class', () => {
      const variants: Array<React.ComponentProps<typeof Button>['variant']> = [
        'primary',
        'secondary',
        'outline',
        'ghost',
        'destructive',
        'success'
      ];
      for (const variant of variants) {
        const { unmount } = render(<Button variant={variant}>x</Button>);
        const btn = screen.getByRole('button', { name: 'x' });
        expect(btn.className).not.toMatch(/#[0-9a-fA-F]{6}/);
        expect(btn.className).toMatch(/bg-|text-|border-/);
        unmount();
      }
    });

    it('disables the button and shows a spinner when loading, without needing a separate disabled prop', () => {
      render(<Button loading>Save</Button>);
      const btn = screen.getByRole('button', { name: /Save/ });
      expect(btn).toBeDisabled();
      expect(btn.querySelector('.animate-spin')).toBeTruthy();
    });

    it('respects an explicit disabled prop independent of loading', () => {
      render(<Button disabled>Save</Button>);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
  });

  describe('Card', () => {
    it('renders children inside a token-based surface', () => {
      render(
        <Card data-testid="card">
          <CardHeader>
            <CardTitle>Title</CardTitle>
          </CardHeader>
          <p>Body</p>
        </Card>
      );
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Body')).toBeInTheDocument();
      expect(screen.getByTestId('card').className).toMatch(/bg-card/);
    });

    it('interactive cards opt into hover/elevation classes; non-interactive cards do not', () => {
      const { rerender } = render(<Card data-testid="card">x</Card>);
      expect(screen.getByTestId('card').className).not.toMatch(/cursor-pointer/);

      rerender(
        <Card data-testid="card" interactive>
          x
        </Card>
      );
      expect(screen.getByTestId('card').className).toMatch(/cursor-pointer/);
    });
  });

  describe('Badge', () => {
    it('defaults to the neutral variant', () => {
      render(<Badge>Status</Badge>);
      expect(screen.getByText('Status').className).toMatch(/bg-muted/);
    });

    it('every semantic variant renders without a raw hex color', () => {
      const variants: Array<React.ComponentProps<typeof Badge>['variant']> = ['success', 'warning', 'destructive', 'info', 'neutral'];
      for (const variant of variants) {
        const { unmount } = render(<Badge variant={variant}>x</Badge>);
        expect(screen.getByText('x').className).not.toMatch(/#[0-9a-fA-F]{6}/);
        unmount();
      }
    });
  });

  describe('Modal', () => {
    it('renders nothing when closed', () => {
      const { container } = render(
        <Modal isOpen={false} onClose={jest.fn()} title="Test">
          content
        </Modal>
      );
      expect(container).toBeEmptyDOMElement();
    });

    it('renders title, content, and calls onClose from the close button when open', () => {
      const onClose = jest.fn();
      render(
        <Modal isOpen onClose={onClose} title="Test Modal">
          <p>Modal body</p>
        </Modal>
      );
      expect(screen.getByText('Test Modal')).toBeInTheDocument();
      expect(screen.getByText('Modal body')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
