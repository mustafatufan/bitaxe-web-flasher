'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowRight, ComputerIcon, Download, Usb, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DeviceSelector from './DeviceSelector'
import BoardVersionSelector from './BoardVersionSelector'
import { ESPLoader, LoaderOptions, Transport, FlashOptions } from 'esptool-js'
import Header from './Header'
import InstructionPanel from './InstructionPanel'

import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

import { serial } from "web-serial-polyfill";

const firmwareUrls: Record<string, Record<string, string>> = {
  max: {
    '102': 'firmware/esp-miner-factory-102-v2.3.0.bin'
  },
  ultra: {
    '201': 'firmware/esp-miner-factory-201-v2.3.0.bin',
    '202': 'firmware/esp-miner-factory-202-v2.3.0.bin',
    '203': 'firmware/esp-miner-factory-203-v2.3.0.bin',
    '204': 'firmware/esp-miner-factory-204-v2.3.0.bin',
    '205': 'firmware/esp-miner-factory-205-v2.3.0.bin',
  },
  supra: {
    '401': 'firmware/esp-miner-factory-401-v2.3.0.bin',
    '402': 'firmware/esp-miner-factory-402-v2.3.0.bin',
  },
  gamma: {
    '601': 'firmware/esp-miner-factory-601-v2.3.0.bin',
  },
  ultrahex: {
    '302': 'firmware/esp-miner-factory-302-v2.1.0.bin',
    '303': 'firmware/esp-miner-factory-303-v2.1.0.bin',
  },
  // Add other device models and their firmware versions here
};

type DeviceModel = keyof typeof firmwareUrls;

export default function LandingHero() {
  const [selectedDevice, setSelectedDevice] = useState<DeviceModel | ''>('')
  const [selectedBoardVersion, setSelectedBoardVersion] = useState('')
  const [status, setStatus] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isFlashing, setIsFlashing] = useState(false)
  const [isLogging, setIsLogging] = useState(false)
  const [esploader, setEsploader] = useState<ESPLoader | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [isChromiumBased, setIsChromiumBased] = useState(true)
  const transportRef = useRef<Transport | null>(null)
  const serialPortRef = useRef<any>(null)
  const loaderRef = useRef<ESPLoader | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const terminalContainerRef = useRef<HTMLDivElement>(null)
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null)
  const logsRef = useRef<string>('')

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isChromium = /chrome|chromium|crios|edge/i.test(userAgent);
    setIsChromiumBased(isChromium);
  }, []);

  useEffect(() => {
    if (terminalContainerRef.current && !terminalRef.current && isLogging) {
      const term = new Terminal({ 
        cols: 80, 
        rows: 24,
        theme: {
          background: '#1a1b26',
          foreground: '#a9b1d6'
        }
      });
      terminalRef.current = term;
      term.open(terminalContainerRef.current);
      term.writeln('Serial logging started...');
      logsRef.current = 'Serial logging started...\n';
    }

    return () => {
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    };
  }, [isLogging]);

  const espLoaderTerminal = {
    clean(): void {
      terminalRef.current?.clear();
      logsRef.current = '';
    },
    writeLine(data: string): void {
      terminalRef.current?.writeln(data);
      logsRef.current += data + '\n';
    },
    write(data: string): void {
      terminalRef.current?.write(data);
      logsRef.current += data;
    },
  };

  const startSerialLogging = async () => {
    if (!transportRef.current) {
      setStatus('Please connect to a device first');
      return;
    }

    try {
      setIsLogging(true);
      
      // Get the port from the transport
      const port = serialPortRef.current;
      
      // Start reading from the already open port
      const reader = port.readable.getReader();
      readerRef.current = reader;

      // Start reading loop
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        // Convert received data to string and write to terminal
        const text = new TextDecoder().decode(value);
        terminalRef.current?.write(text);
        logsRef.current += text;
      }
    } catch (error) {
      console.error('Serial logging error:', error);
      setStatus(`Logging error: ${error instanceof Error ? error.message : String(error)}`);
      setIsLogging(false);
    }
  };

  const stopSerialLogging = async () => {
    if (readerRef.current) {
      await readerRef.current.cancel();
      readerRef.current = null;
    }
    setIsLogging(false);
  };

  const downloadLogs = () => {
    const blob = new Blob([logsRef.current], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `bitaxe-logs-${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleConnect = async () => {
    setIsConnecting(true)
    setStatus('Connecting to device...')

    try {
      // try to connect to serial Port
      const port = await navigator.serial.requestPort({})
      serialPortRef.current = port;
      const transport = new Transport(port)
      transportRef.current = transport
      
      // init the ESPLoader with preset configuration and baudrate
      const loader = new ESPLoader({
        transport,
        baudrate: 115200,
        romBaudrate: 115200,
        terminal: espLoaderTerminal,
      })
      

      await loader.main()
      setEsploader(loader)
      setStatus('Connected successfully!')
      setIsConnected(true)
    } catch (error) {
      console.error('Connection failed:', error)
      setStatus(`Connection failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (isLogging) {
      await stopSerialLogging();
    }
    if (transportRef.current) {
      await transportRef.current.disconnect()
      setIsConnected(false)
      setStatus("")
      loaderRef.current = null
      transportRef.current = null
      serialPortRef.current = null;
    }
  }

  const handleStartFlashing = async () => {
    if (!esploader) {
      setStatus('Please connect to a device first')
      return
    }

    if (!selectedDevice || !selectedBoardVersion) {
      setStatus('Please select both device model and board version')
      return
    }

    setIsFlashing(true)
    setStatus('Preparing to flash...')
    
    try {
      const firmwareUrl = firmwareUrls[selectedDevice]?.[selectedBoardVersion]
      if (!firmwareUrl) {
        throw new Error('No firmware available for the selected device and board version')
      }

      const firmwareResponse = await fetch(firmwareUrl)
      
      if (!firmwareResponse.ok) {
        throw new Error('Failed to load firmware file')
      }
      
      const firmwareArrayBuffer = await firmwareResponse.arrayBuffer()
      const firmwareUint8Array = new Uint8Array(firmwareArrayBuffer)
      
      // Convert Uint8Array to binary string
      const firmwareBinaryString = Array.from(firmwareUint8Array, (byte) => String.fromCharCode(byte)).join('')
      
      setStatus('Flashing firmware...')

      const flashOptions: FlashOptions = {
        fileArray: [{
          data: firmwareBinaryString,
          address: 0
        }],
        flashSize: "keep",
        flashMode: "keep",
        flashFreq: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
          setStatus(`Flashing: ${Math.round((written / total) * 100)}% complete`)
        },
        calculateMD5Hash: (image) => {
          console.log('MD5 calculation not implemented')
          return ''
        },
      }
      
      await esploader.writeFlash(flashOptions)
      
      setStatus('Flashing completed. Restarting device...')
      await esploader.hardReset()
      
      setStatus('Flashing completed successfully! Device has been restarted.')
    } catch (error) {
      console.error('Flashing failed:', error)
      setStatus(`Flashing failed: ${error instanceof Error ? error.message : String(error)}. Please try again.`)

    } finally {
      setIsFlashing(false)
    }
  }

  if (!isChromiumBased) {
    return (
      <div className="container px-4 md:px-6 py-12 text-center">
        <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none mb-4">
          Browser Compatibility Error
        </h1>
        <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl dark:text-gray-400">
          This application requires a Chromium-based browser (such as Google Chrome, Microsoft Edge, or Brave) to function properly. Please switch to a compatible browser and try again.
        </p>
      </div>
    )
  }

  return (
    <>
      <Header onOpenPanel={() => setIsPanelOpen(true)} />
      <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                Flash Your Bitaxe Directly from the Web
              </h1>
              <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl dark:text-gray-400">
                Connect your device, select your model and board version, and start flashing immediately. No setup required.
              </p>
            </div>
            <div className="w-full max-w-sm space-y-2">
              <Button 
                className="w-full" 
                onClick={isConnected ? handleDisconnect : handleConnect}
                disabled={isConnecting || isFlashing }
              >
                {isConnected ? 'Disconnect' : 'Connect'}
                <Usb className="ml-2 h-4 w-4" />
              </Button>
              <DeviceSelector 
                onValueChange={(value) => {
                  setSelectedDevice(value as DeviceModel)
                  setSelectedBoardVersion('')
                }} 
                disabled={isConnecting || isFlashing || esploader === null || isConnected == false} 
              />
              {selectedDevice && (
                <BoardVersionSelector 
                  deviceModel={selectedDevice}
                  onValueChange={setSelectedBoardVersion}
                  disabled={isConnecting || isFlashing }
                />
              )}
              <Button 
                className="w-full" 
                onClick={handleStartFlashing}
                disabled={!selectedDevice || !selectedBoardVersion || isConnecting || isFlashing || esploader === null}
              >
                {isFlashing ? 'Flashing...' : 'Start Flashing'}
                <Zap className="ml-2 h-4 w-4" />
              </Button>
              <div className="flex gap-2">
                <Button 
                  className="flex-1" 
                  onClick={isLogging ? stopSerialLogging : startSerialLogging}
                  disabled={!isConnected || isFlashing}
                >
                  {isLogging ? 'Stop Logging' : 'Start Logging'}
                  <ComputerIcon className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  className="flex-1"
                  onClick={downloadLogs}
                  disabled={!logsRef.current}
                >
                  Download Logs
                  <Download className="ml-2 h-4 w-4" />
                </Button>
              </div>
              <p className="mx-auto max-w-[400px] text-gray-500 md:text-m dark:text-gray-400">
                Connect your device, log the serial data and download it later on.
              </p>
              {status && <p className="mt-2 text-sm font-medium">{status}</p>}
            </div>
            {isLogging && (
              <div 
                ref={terminalContainerRef}
                className="w-full max-w-4xl h-[400px] bg-black rounded-lg overflow-hidden mt-8 border border-gray-700"
              />
            )}
          </div>
        </div>
      </section>
      <InstructionPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
    </>
  )
}
