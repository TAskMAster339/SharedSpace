import React from 'react';
import { Link as RouterLink, LinkProps as RouterLinkProps } from 'react-router-dom';
import { cn } from '../../utils/cn';

interface LinkProps extends RouterLinkProps {
  variant?: 'primary' | 'secondary';
}

export const Link: React.FC<LinkProps> = ({
  variant = 'primary',
  className,
  children,
  ...props
}) => {
  const variants = {
    primary: 'text-brand hover:text-brand-hover font-medium',
    secondary: 'text-theme-secondary hover:text-theme-primary',
  };

  return (
    <RouterLink className={cn(variants[variant], 'transition-colors', className)} {...props}>
      {children}
    </RouterLink>
  );
};