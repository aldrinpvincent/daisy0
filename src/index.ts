#!/usr/bin/env node

// Main entry point - delegates to unified CLI
import { program } from './cli';

// Parse command line arguments and run
program.parse();