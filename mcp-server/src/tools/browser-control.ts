export interface BrowserControlArgs {
  action: 'click' | 'type' | 'navigate' | 'scroll' | 'inspect' | 'evaluate' | 'wait' | 'screenshot';
  selector?: string;
  text?: string;
  url?: string;
  code?: string;
  x?: number;
  y?: number;
  timeout?: number;
  context?: string;
  properties?: string[];
  waitFor?: 'element' | 'network' | 'load';
  clear?: boolean;
}

export async function browserControl(args: BrowserControlArgs, controlApiRequest: Function) {
  try {
    switch (args.action) {
      case 'click':
        return await handleClick(args, controlApiRequest);
      case 'type':
        return await handleType(args, controlApiRequest);
      case 'navigate':
        return await handleNavigate(args, controlApiRequest);
      case 'scroll':
        return await handleScroll(args, controlApiRequest);
      case 'inspect':
        return await handleInspect(args, controlApiRequest);
      case 'evaluate':
        return await handleEvaluate(args, controlApiRequest);
      case 'wait':
        return await handleWait(args, controlApiRequest);
      case 'screenshot':
        return await handleScreenshot(args, controlApiRequest);
      default:
        throw new Error(`Unknown browser action: ${args.action}`);
    }
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          action: args.action,
          error: error.message,
          troubleshooting: generateTroubleshooting(args.action, error.message)
        }, null, 2)
      }],
      isError: true
    };
  }
}

async function handleClick(args: BrowserControlArgs, controlApiRequest: Function) {
  if (!args.selector) {
    throw new Error('selector is required for click action');
  }

  const response = await controlApiRequest('/click', 'POST', {
    selector: args.selector,
    timeout: args.timeout || 5000
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        action: 'click',
        selector: args.selector,
        result: response.result,
        timestamp: response.timestamp,
        debugInfo: {
          elementFound: true,
          clickCoordinates: response.result?.coordinates,
          elementType: response.result?.elementTag
        }
      }, null, 2)
    }]
  };
}

async function handleType(args: BrowserControlArgs, controlApiRequest: Function) {
  if (!args.selector || args.text === undefined) {
    throw new Error('selector and text are required for type action');
  }

  const response = await controlApiRequest('/type', 'POST', {
    selector: args.selector,
    text: args.text,
    timeout: args.timeout || 5000,
    clear: args.clear || false
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        action: 'type',
        selector: args.selector,
        text: args.text,
        result: response.result,
        timestamp: response.timestamp,
        debugInfo: {
          textEntered: args.text,
          fieldCleared: args.clear,
          finalValue: response.result?.finalValue
        }
      }, null, 2)
    }]
  };
}

async function handleNavigate(args: BrowserControlArgs, controlApiRequest: Function) {
  if (!args.url) {
    throw new Error('url is required for navigate action');
  }

  const response = await controlApiRequest('/navigate', 'POST', {
    url: args.url,
    waitForLoad: true,
    timeout: args.timeout || 10000
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        action: 'navigate',
        url: args.url,
        result: response.result,
        timestamp: response.timestamp,
        debugInfo: {
          navigationComplete: true,
          pageLoaded: true
        }
      }, null, 2)
    }]
  };
}

async function handleScroll(args: BrowserControlArgs, controlApiRequest: Function) {
  const response = await controlApiRequest('/scroll', 'POST', {
    selector: args.selector,
    x: args.x,
    y: args.y,
    behavior: 'smooth'
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        action: 'scroll',
        target: args.selector || `${args.x},${args.y}`,
        result: response.result,
        timestamp: response.timestamp
      }, null, 2)
    }]
  };
}

async function handleInspect(args: BrowserControlArgs, controlApiRequest: Function) {
  if (!args.selector) {
    throw new Error('selector is required for inspect action');
  }

  const response = await controlApiRequest('/inspect', 'POST', {
    selector: args.selector,
    properties: args.properties || ['textContent', 'innerHTML', 'className', 'id']
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        action: 'inspect',
        selector: args.selector,
        result: response.result,
        timestamp: response.timestamp,
        debugInfo: {
          elementExists: !!response.result,
          propertiesRetrieved: args.properties || ['textContent', 'innerHTML', 'className', 'id']
        }
      }, null, 2)
    }]
  };
}

async function handleEvaluate(args: BrowserControlArgs, controlApiRequest: Function) {
  if (!args.code) {
    throw new Error('code is required for evaluate action');
  }

  const response = await controlApiRequest('/execute', 'POST', {
    code: args.code,
    returnByValue: true,
    timeout: args.timeout || 10000
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        action: 'evaluate',
        code: args.code,
        result: response.result,
        timestamp: response.timestamp,
        debugInfo: {
          executionTime: 'unknown',
          returnType: typeof response.result?.result
        }
      }, null, 2)
    }]
  };
}

async function handleWait(args: BrowserControlArgs, controlApiRequest: Function) {
  let endpoint = '';
  let payload: any = {};

  switch (args.waitFor) {
    case 'element':
      if (!args.selector) {
        throw new Error('selector is required when waiting for element');
      }
      endpoint = '/wait-for-element';
      payload = {
        selector: args.selector,
        timeout: args.timeout || 10000,
        visible: true
      };
      break;
    case 'network':
      endpoint = '/wait-for-network-idle';
      payload = {
        timeout: args.timeout || 10000,
        idleTime: 1000
      };
      break;
    default:
      throw new Error('waitFor must be "element" or "network"');
  }

  const response = await controlApiRequest(endpoint, 'POST', payload);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        action: 'wait',
        waitFor: args.waitFor,
        target: args.selector || 'network idle',
        result: response.result,
        timestamp: response.timestamp,
        debugInfo: {
          waitCompleted: true,
          timeout: args.timeout || 10000
        }
      }, null, 2)
    }]
  };
}

async function handleScreenshot(args: BrowserControlArgs, controlApiRequest: Function) {
  const response = await controlApiRequest('/screenshot', 'POST', {
    context: args.context || 'browser-control'
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        action: 'screenshot',
        screenshot: response.screenshot,
        timestamp: response.timestamp,
        debugInfo: {
          context: args.context || 'browser-control',
          screenshotPath: response.screenshot
        }
      }, null, 2)
    }]
  };
}

function generateTroubleshooting(action: string, errorMessage: string): string[] {
  const tips: string[] = [];

  if (errorMessage.includes('selector')) {
    tips.push('Verify the CSS selector is correct and the element exists');
    tips.push('Try using a more specific selector or wait for the element to load');
  }

  if (errorMessage.includes('timeout')) {
    tips.push('Increase the timeout value if the page is slow to load');
    tips.push('Check if the element appears after some delay');
  }

  if (errorMessage.includes('not found')) {
    tips.push('Element may not be visible or may not exist on the current page');
    tips.push('Check the page URL and ensure you\'re on the correct page');
  }

  switch (action) {
    case 'click':
      tips.push('Ensure the element is clickable and not covered by other elements');
      break;
    case 'type':
      tips.push('Verify the element is an input field or textarea');
      tips.push('Check if the field is enabled and not readonly');
      break;
    case 'navigate':
      tips.push('Verify the URL is correct and accessible');
      tips.push('Check network connectivity');
      break;
  }

  return tips;
}