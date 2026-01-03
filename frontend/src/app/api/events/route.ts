// Next.js API Route to properly proxy SSE from backend
// Next.js rewrites don't handle streaming properly, so we need this

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
    const backendUrl = 'http://127.0.0.1:8001/api/events'

    try {
        const response = await fetch(backendUrl, {
            headers: {
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache',
            },
        })

        if (!response.ok) {
            return new Response('Backend SSE connection failed', { status: 502 })
        }

        // Create a TransformStream to pipe the response
        const { readable, writable } = new TransformStream()

        // Pipe backend response to our stream
        response.body?.pipeTo(writable).catch(() => {
            // Connection closed, ignore
        })

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no', // Disable nginx buffering if present
            },
        })
    } catch (error) {
        console.error('SSE proxy error:', error)
        return new Response('SSE connection error', { status: 500 })
    }
}
