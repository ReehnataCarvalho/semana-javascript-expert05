import Busboy from 'busboy'
import fs from 'fs'
import { pipeline } from 'stream/promises'
import { logger } from './logger'

export default class UploadHandler {
  // socketIo para poder dar o io.emit (o socket io é responsável por fazer a comunicação de cliente e servidor, enviar e notificar o cliente)
  // socketId para conseguirmos saber quem é o usuario para quando formos enviar notificações etc

  constructor({ io, socketId, downloadsFolder, messageTimeDelay = 200 }) {
    this.io = io
    this.socketId = socketId
    this.downloadsFolder = downloadsFolder

    // Evento que vamos mandar para o browser para ele ouvir e se comunicar
    this.ON_UPLOAD_EVENT = 'file-upload'
  }

  /**
   * Função responsavel de executar o (lastExecution) somente quando nossa condição for verdadeira
   * @param {*} lastExecution ultima execução
   */
  canExecute(lastExecution) {
    return (Date.now() - lastExecution) >= this.messageTimeDelay
  }

  handlerFileBytes(filename) {
    // Ultima vez que foi executado
    this.lastMessageSent = Date.now()

    async function* handleData(source) {
      let processedAlready = 0

      // Para cada pedaço do arquivo vamos repassar ele para frente usando o -> yield chunk 
      // (o yield fala repassa o pedaço do arquvo para frente e continua o processo enquanto eu executo outras coisas ao mesmo tempo)
      for await(const chunk of source) {
        yield chunk
        processedAlready += chunk.length

        if(!this.canExecute(this.lastMessageSent)) {
          continue;
        }
        
        console.log('chunk', chunk)
        console.log('-------------------')

        this.lastMessageSent = Date.now()
        this.io.to(this.socketId).emit(this.ON_UPLOAD_EVENT, { processedAlready, filename})
        logger.info(`File [${filename}] got ${processedAlready} bytes to ${this.socketId}`)
      }
    }

    return handleData.bind(this)
  }

  async onFile(fieldname, file, filename) {
    // Caminho do arquivo
    const saveTo = `${this.downloadsFolder}/${filename}`

    await pipeline(
      // 1º passo -> pegar uma readable stream!
      file,
      //2º passo -> filtrar, converter, transformar dados!
      // apply: é o mesmo que chamar a função passando o parametro direto com a diferença que reforçamos o this que será usado 
      this.handlerFileBytes.apply(this, [filename]),
      // 3º passo -> é a saida do processo, uma writeable stream
      fs.createWriteStream(saveTo)
    )
    logger.info(`File [${filename}] finished`)
  }

  registerEvents(headers, onFinish) {
    const busboy = new Busboy({ headers })

    // mostrando o arquivo que o cliente esta enviando
    // passamos o -> this para garantir que o this usado pelo onFile é o que estamos usando nessa class
    // e não o proprio dele do onFile
    busboy.on('file', this.onFile.bind(this))

    // Para saber que todos os arquivos da requisição acabou
    busboy.on('finish', onFinish)

    return busboy
  }
}