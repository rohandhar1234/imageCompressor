import sharp from 'sharp'

function print(obj) {
  console.log(JSON.stringify(obj, null, 2))
}

(async function main(){
  try {
    print({ versions: sharp.versions })
    // format is an object with format names
    const formats = {}
    for (const [k,v] of Object.entries(sharp.format)) {
      formats[k] = { input: !!v.input, output: !!v.output }
    }
    print({ formats })
  } catch (err) {
    console.error('Error while checking sharp:', err)
    process.exit(1)
  }
})()
