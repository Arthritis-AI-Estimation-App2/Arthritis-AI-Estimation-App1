"use client";

import NextLink from "next/link";
import { type ComponentProps, type ComponentRef, forwardRef } from "react";

type LinkProps = ComponentProps<typeof NextLink>;

/**
 * 認証付きの動的ページでは先読み結果を遷移時に使わないため、
 * 既定で prefetch しない。
 */
const Link = forwardRef<ComponentRef<typeof NextLink>, LinkProps>(
  function Link({ prefetch = false, ...props }, ref) {
    return <NextLink ref={ref} prefetch={prefetch} {...props} />;
  },
);

export default Link;
